"use server";

import { extractTextFromFile, runExtractionTool } from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import type { ExtractedProviderFields } from "@/lib/merge-provider-fields";
import type { ProviderFormDefaults } from "@/components/provider-form";

export type ExtractProviderState =
  | { fields: ExtractedProviderFields }
  | { error: string };

// status, assessment_status, and is_incumbent are deliberately not part of this
// schema — those are internal tracking judgment a user sets manually, never a
// fact pulled from a document.
const EXTRACT_PROVIDER_TOOL = {
  name: "record_provider_details",
  description:
    "Record details about a specific 3PL (third-party logistics) provider found in the source document. Only include fields the text actually and clearly states — omit anything not confidently present. Never guess or fabricate a value.",
  input_schema: {
    type: "object" as const,
    properties: {
      company_name: { type: "string" },
      provider_type: { type: "string" },
      website: { type: "string" },
      location: { type: "string" },
      footprint_source: { type: "string" },
      contact_person: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      receiving: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers receiving. Omit if not confirmed — never set false.",
      },
      storage: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers storage. Omit if not confirmed — never set false.",
      },
      fulfillment: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers fulfillment (pick/check/pack). Omit if not confirmed — never set false.",
      },
      dispatch: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers dispatch. Omit if not confirmed — never set false.",
      },
      adhoc_kitting_bundling: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers ad-hoc kitting/bundling. Omit if not confirmed — never set false.",
      },
      adhoc_labelling: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers ad-hoc labelling. Omit if not confirmed — never set false.",
      },
      returns: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers returns processing. Omit if not confirmed — never set false.",
      },
      annual_inventory_count: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers annual inventory counts. Omit if not confirmed — never set false.",
      },
      cycle_count: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers cycle counts. Omit if not confirmed — never set false.",
      },
      inventory_count_on_request: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers inventory counts on request. Omit if not confirmed — never set false.",
      },
      one_time_system_setup: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers one-time system setup. Omit if not confirmed — never set false.",
      },
      lot_batch_expiry_tracking: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers lot/batch/expiry tracking. Omit if not confirmed — never set false.",
      },
      temp_controlled_storage: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers temperature-controlled storage. Omit if not confirmed — never set false.",
      },
      retail_edi_compliance: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers retail/EDI compliance. Omit if not confirmed — never set false.",
      },
      cross_docking: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider offers cross-docking. Omit if not confirmed — never set false.",
      },
      b2b: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider serves B2B clients. Omit if not confirmed — never set false.",
      },
      b2c: {
        type: "boolean",
        description:
          "Include only if the document explicitly confirms this provider serves B2C clients. Omit if not confirmed — never set false.",
      },
      onboarding_period_months: { type: "integer" },
      virtual_tour_url: { type: "string" },
      billing_terms: { type: "string" },
      other_specialization: { type: "string" },
      storage_cost: { type: "number" },
      pick_pack_cost: { type: "number" },
      receiving_cost: { type: "number" },
      returns_cost: { type: "number" },
    },
  },
};

// currentValues, when passed, puts this call in "merge mode" (the Edit 3PL
// page updating an existing provider) rather than blank-slate prefill (the
// Add 3PL "Start from Scratch"/upload choice screen, which has no existing
// record to compare against and always omits this argument).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information. For capability fields, this means: if a capability is already true on the current record and the document merely reconfirms it, omit that capability from your output rather than returning it again.";

export async function extractProviderIntake(
  formData: FormData,
  currentValues?: ProviderFormDefaults,
): Promise<ExtractProviderState> {
  const file = formData.get("document") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    console.error("extractProviderIntake: file parsing failed", err);
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
    "You extract structured data about a specific 3PL (third-party logistics) provider from freeform notes or documents describing them. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, or fabricate a value — omit any field that isn't clearly present. For capability fields (receiving, storage, fulfillment, and so on), only include the key — set to true — if the document explicitly confirms the provider offers that capability. Never include a capability set to false, and never guess a capability based on the provider's general type or industry. Do not extract or infer any pipeline status, assessment, or incumbent designation — those are not part of this schema.";

  let currentValuesForPrompt: Record<string, unknown> | undefined;
  if (currentValues) {
    systemPrompt += MERGE_MODE_INSTRUCTION;
    currentValuesForPrompt = pickNonNull(currentValues, [
      "provider_type",
      "website",
      "location",
      "footprint_source",
      "contact_person",
      "email",
      "phone",
      "receiving",
      "storage",
      "fulfillment",
      "dispatch",
      "adhoc_kitting_bundling",
      "adhoc_labelling",
      "returns",
      "annual_inventory_count",
      "cycle_count",
      "inventory_count_on_request",
      "one_time_system_setup",
      "lot_batch_expiry_tracking",
      "temp_controlled_storage",
      "retail_edi_compliance",
      "cross_docking",
      "b2b",
      "b2c",
      "onboarding_period_months",
      "virtual_tour_url",
      "billing_terms",
      "other_specialization",
      "storage_cost",
      "pick_pack_cost",
      "receiving_cost",
      "returns_cost",
    ]);
  }

  const result = await runExtractionTool<ExtractedProviderFields>(
    text,
    EXTRACT_PROVIDER_TOOL,
    systemPrompt,
    currentValuesForPrompt,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { fields: result.input };
}
