"use server";

import {
  cleanExtractedText,
  extractTextFromFile,
  runExtractionTool,
} from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import {
  EXTRACTABLE_FIELD_KEYS,
  type ExtractedForwarderProjectFields,
} from "@/lib/forwarder/merge-project-fields";
import {
  BROKERAGE_OPTIONS,
  CURRENCIES,
  INCOTERMS,
  INSURANCE_OPTIONS,
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
  STACKABLE_OPTIONS,
  YES_NO,
} from "@/lib/forwarder/project-fields";
import { createClient } from "@/lib/supabase/server";
import { findClientByName, type ClientOption } from "@/lib/clients";

// `client` is the client the document names (New Project only): matchedClient
// is set when that name already exists, so the entry screen preselects it
// instead of offering to create a duplicate. Merge mode (project edit) never
// returns client details — they belong to the shared, admin-only client
// record, mirroring 3PL's client-intake extraction.
export type ExtractForwarderProjectState =
  | {
      fields: ExtractedForwarderProjectFields;
      client?: { name: string; business_model: string | null };
      matchedClient?: ClientOption;
    }
  | { error: string };

const EXTRACT_TOOL = {
  name: "record_forwarder_project_intake",
  description:
    "Record forwarder-sourcing project intake fields found in the source document. Only include fields the text actually and clearly states — omit anything not confidently present. Never guess, estimate, or fabricate a value, and never default a count to 1 or infer it from a nearby but different number (e.g. don't assume a pallet count from a carton count, or a unit count from an order count) — a numeric field must come from an explicit number in the text for that exact quantity. If the document states a shipment mode and type that don't naturally pair together, extract exactly what's said anyway — don't try to reconcile or correct the pairing yourself. Never output a placeholder like 'unknown', 'N/A', or similar for a field you couldn't confidently fill — omit it entirely instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      client_name: { type: "string" },
      business_model: { type: "string" },

      origin_country: { type: "string" },
      origin_city: { type: "string" },
      origin_port: { type: "string" },
      destination_country: { type: "string" },
      destination_city: { type: "string" },
      destination_port: { type: "string" },
      final_delivery_address: { type: "string" },

      cargo_description: { type: "string" },
      packaging_type: { type: "string" },
      units: {
        type: "integer",
        description: "Only if an explicit unit count is stated. Never infer from cartons, pallets, or order counts.",
      },
      cartons: {
        type: "integer",
        description: "Only if an explicit carton count is stated. Never infer from units, pallets, or weight.",
      },
      pallets: {
        type: "integer",
        description: "Only if an explicit pallet count is stated. Never default to 1 or infer from cartons/weight — most documents don't state this.",
      },
      weight_kg: { type: "number" },
      cbm: { type: "number" },
      stackable: { type: "string", enum: STACKABLE_OPTIONS },
      dangerous_goods: { type: "string", enum: YES_NO },
      temperature_controlled: { type: "string", enum: YES_NO },
      special_handling: { type: "string" },

      packing_list_available: { type: "string", enum: YES_NO },
      packing_list_reference: { type: "string" },
      packing_list_notes: { type: "string" },

      current_incoterm: { type: "string", enum: INCOTERMS },
      shipment_mode: { type: "string", enum: SHIPMENT_MODES },
      shipment_type: { type: "string", enum: SHIPMENT_TYPES },
      current_freight_cost_usd: { type: "number" },
      current_freight_forwarder: { type: "string" },
      current_lead_time_days: { type: "number" },

      shipments_per_month: { type: "number" },
      shipments_per_year: { type: "number" },

      incoterms_to_compare: {
        type: "array",
        items: { type: "string", enum: INCOTERMS },
      },
      final_incoterm: { type: "string", enum: INCOTERMS },
      final_shipment_mode: { type: "string", enum: SHIPMENT_MODES },
      final_shipment_type: { type: "string", enum: SHIPMENT_TYPES },
      target_lead_time_days: { type: "number" },

      hs_code: { type: "string" },
      invoice_value: { type: "number" },
      invoice_currency: { type: "string", enum: CURRENCIES },
      insurance_required: { type: "string", enum: INSURANCE_OPTIONS },
      brokerage_needed: { type: "string", enum: BROKERAGE_OPTIONS },
    },
  },
};

type ExtractedIntake = {
  client_name?: string;
  business_model?: string;
  origin_country?: string;
  origin_city?: string;
  origin_port?: string;
  destination_country?: string;
  destination_city?: string;
  destination_port?: string;
  final_delivery_address?: string;
  cargo_description?: string;
  packaging_type?: string;
  units?: number;
  cartons?: number;
  pallets?: number;
  weight_kg?: number;
  cbm?: number;
  stackable?: string;
  dangerous_goods?: string;
  temperature_controlled?: string;
  special_handling?: string;
  packing_list_available?: string;
  packing_list_reference?: string;
  packing_list_notes?: string;
  current_incoterm?: string;
  shipment_mode?: string;
  shipment_type?: string;
  current_freight_cost_usd?: number;
  current_freight_forwarder?: string;
  current_lead_time_days?: number;
  shipments_per_month?: number;
  shipments_per_year?: number;
  incoterms_to_compare?: string[];
  final_incoterm?: string;
  final_shipment_mode?: string;
  final_shipment_type?: string;
  target_lead_time_days?: number;
  hs_code?: string;
  invoice_value?: number;
  invoice_currency?: string;
  insurance_required?: string;
  brokerage_needed?: string;
};

function pickEnum<T extends string>(
  value: string | undefined,
  options: readonly T[],
): T | null {
  return value !== undefined && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function toForwarderProjectFields(
  extracted: ExtractedIntake,
): ExtractedForwarderProjectFields {
  return {
    origin_country: cleanExtractedText(extracted.origin_country) ?? null,
    origin_city: cleanExtractedText(extracted.origin_city) ?? null,
    origin_port: cleanExtractedText(extracted.origin_port) ?? null,
    destination_country: cleanExtractedText(extracted.destination_country) ?? null,
    destination_city: cleanExtractedText(extracted.destination_city) ?? null,
    destination_port: cleanExtractedText(extracted.destination_port) ?? null,
    final_delivery_address:
      cleanExtractedText(extracted.final_delivery_address) ?? null,

    cargo_description: cleanExtractedText(extracted.cargo_description) ?? null,
    packaging_type: cleanExtractedText(extracted.packaging_type) ?? null,
    units: extracted.units ?? null,
    cartons: extracted.cartons ?? null,
    pallets: extracted.pallets ?? null,
    weight_kg: extracted.weight_kg ?? null,
    cbm: extracted.cbm ?? null,
    stackable: pickEnum(extracted.stackable, STACKABLE_OPTIONS),
    dangerous_goods: pickEnum(extracted.dangerous_goods, YES_NO),
    temperature_controlled: pickEnum(extracted.temperature_controlled, YES_NO),
    special_handling: cleanExtractedText(extracted.special_handling) ?? null,

    packing_list_available: pickEnum(extracted.packing_list_available, YES_NO),
    packing_list_reference:
      cleanExtractedText(extracted.packing_list_reference) ?? null,
    packing_list_notes: cleanExtractedText(extracted.packing_list_notes) ?? null,

    current_incoterm: pickEnum(extracted.current_incoterm, INCOTERMS),
    shipment_mode: pickEnum(extracted.shipment_mode, SHIPMENT_MODES),
    shipment_type: pickEnum(extracted.shipment_type, SHIPMENT_TYPES),
    current_freight_cost_usd: extracted.current_freight_cost_usd ?? null,
    current_freight_forwarder:
      cleanExtractedText(extracted.current_freight_forwarder) ?? null,
    current_lead_time_days: extracted.current_lead_time_days ?? null,

    shipments_per_month: extracted.shipments_per_month ?? null,
    shipments_per_year: extracted.shipments_per_year ?? null,

    incoterms_to_compare: extracted.incoterms_to_compare
      ? INCOTERMS.filter((term) => extracted.incoterms_to_compare!.includes(term))
      : undefined,
    final_incoterm: pickEnum(extracted.final_incoterm, INCOTERMS),
    final_shipment_mode: pickEnum(extracted.final_shipment_mode, SHIPMENT_MODES),
    final_shipment_type: pickEnum(extracted.final_shipment_type, SHIPMENT_TYPES),
    target_lead_time_days: extracted.target_lead_time_days ?? null,

    hs_code: cleanExtractedText(extracted.hs_code) ?? null,
    invoice_value: extracted.invoice_value ?? null,
    invoice_currency: pickEnum(extracted.invoice_currency, CURRENCIES),
    insurance_required: pickEnum(extracted.insurance_required, INSURANCE_OPTIONS),
    brokerage_needed: pickEnum(extracted.brokerage_needed, BROKERAGE_OPTIONS),
  };
}

// currentValues, when passed, puts this call in "merge mode" (editing an
// existing forwarder project) rather than blank-slate prefill (a brand new
// project, which has no existing record to compare against).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information.";

export async function extractForwarderProjectIntake(
  formData: FormData,
  currentValues?: ExtractedForwarderProjectFields,
): Promise<ExtractForwarderProjectState> {
  const file = formData.get("document") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    console.error("extractForwarderProjectIntake: file parsing failed", err);
    return {
      error:
        err instanceof Error && err.message.startsWith("Unsupported file type")
          ? err.message
          : "Couldn't read that file. It may be corrupt or in an unsupported format.",
    };
  }

  if (!text.trim()) {
    return { error: "No readable text was found in that file." };
  }

  let systemPrompt =
    "You extract structured shipment and project-intake data for a freight-forwarder sourcing tool from freeform notes, discovery-call transcripts, or documents. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, estimate, or fabricate a value — omit any field that isn't clearly present, even a numeric one (a missing count is far more common than a stated one; do not default it to 1 or any other number). For fields with a fixed set of allowed values, only use one of the given options; do not invent new values. Never output filler text like 'unknown' or 'N/A' for a field you can't confidently fill — omit the field instead of naming your own uncertainty.";

  let currentValuesForPrompt: Record<string, unknown> | undefined;
  if (currentValues) {
    systemPrompt += MERGE_MODE_INSTRUCTION;
    currentValuesForPrompt = pickNonNull(currentValues, EXTRACTABLE_FIELD_KEYS);
  }

  const result = await runExtractionTool<ExtractedIntake>(
    text,
    EXTRACT_TOOL,
    systemPrompt,
    currentValuesForPrompt,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  const fields = toForwarderProjectFields(result.input);

  const clientName = cleanExtractedText(result.input.client_name);
  if (currentValues || !clientName) {
    return { fields };
  }

  const supabase = await createClient();
  const matchedClient = await findClientByName(supabase, clientName);
  return {
    fields,
    client: {
      name: clientName,
      business_model: cleanExtractedText(result.input.business_model) ?? null,
    },
    ...(matchedClient ? { matchedClient } : {}),
  };
}
