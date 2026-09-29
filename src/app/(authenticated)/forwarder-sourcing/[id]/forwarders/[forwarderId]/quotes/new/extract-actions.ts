"use server";

import {
  cleanExtractedText,
  extractTextFromFile,
  runExtractionTool,
} from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import {
  EXTRACTABLE_FIELD_KEYS,
  type ExtractedQuoteFields,
} from "@/lib/forwarder/merge-quote-fields";
import { canonicalizeScenarioGroup, pickDate } from "@/lib/forwarder/quote-extraction";
import {
  CURRENCIES,
  INCOTERMS,
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
} from "@/lib/forwarder/project-fields";

export type ExtractQuoteState =
  | { fields: ExtractedQuoteFields }
  | { error: string };

const EXTRACT_TOOL = {
  name: "record_quote_details",
  description:
    "Record freight-quote details found in the source document. Only include fields the text actually and clearly states — omit anything not confidently present. Never guess, estimate, or fabricate a value, including dates, weights, and cost figures. If the document explicitly denies or contradicts something, record that; if it's simply silent, omit the field. Never output a placeholder like 'unknown', 'N/A', or similar for a field you couldn't confidently fill — omit it entirely instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      scenario_group: {
        type: "string",
        description:
          "The shipment lane/scenario this quote is for. If it matches one of the EXISTING SCENARIO GROUPS given to you, reuse that exact string verbatim — do not write new text for the same scenario. Only write new text if none of the existing groups clearly describe this document's scenario.",
      },
      shipment_mode: { type: "string", enum: SHIPMENT_MODES },
      shipment_type: { type: "string", enum: SHIPMENT_TYPES },
      origin: { type: "string" },
      destination: { type: "string" },
      incoterm: { type: "string", enum: INCOTERMS },

      actual_weight_kg: { type: "number" },
      chargeable_weight_kg: { type: "number" },
      cbm: { type: "number" },
      cost_of_goods_usd: { type: "number" },

      original_currency: { type: "string", enum: CURRENCIES },
      original_amount: { type: "number" },
      exchange_rate_to_usd: {
        type: "number",
        description:
          "ONLY include this if the document states an explicit numeric exchange rate (e.g. '1 THB = 0.028 USD', 'exchange rate: 0.14'). NEVER compute, derive, or estimate one from other numbers in the document, even if it looks mathematically derivable. If original_currency is not USD and no explicit rate is stated, omit this field entirely — do not default it to 1 or any other number. A missing rate must be left for the user to enter manually; a guessed rate silently corrupts cost calculations.",
      },

      duties_taxes_usd: { type: "number" },
      other_charges_usd: { type: "number" },
      other_charges_description: { type: "string" },

      lead_time_min_days: { type: "number" },
      lead_time_max_days: { type: "number" },
      quote_date: { type: "string", description: "ISO format YYYY-MM-DD." },
      rate_valid_until: { type: "string", description: "ISO format YYYY-MM-DD." },
      quote_reference: { type: "string" },
    },
  },
};

type ExtractedIntake = {
  scenario_group?: string;
  shipment_mode?: string;
  shipment_type?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  actual_weight_kg?: number;
  chargeable_weight_kg?: number;
  cbm?: number;
  cost_of_goods_usd?: number;
  original_currency?: string;
  original_amount?: number;
  exchange_rate_to_usd?: number;
  duties_taxes_usd?: number;
  other_charges_usd?: number;
  other_charges_description?: string;
  lead_time_min_days?: number;
  lead_time_max_days?: number;
  quote_date?: string;
  rate_valid_until?: string;
  quote_reference?: string;
};

function pickEnum<T extends string>(
  value: string | undefined,
  options: readonly T[],
): T | null {
  return value !== undefined && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function toExtractedQuoteFields(
  extracted: ExtractedIntake,
  existingScenarioGroups: string[],
): ExtractedQuoteFields {
  // original_currency/exchange_rate_to_usd are non-nullable columns (the
  // schema defaults them to "USD"/1 when blank), so Partial<QuoteFields>
  // types them as `| undefined`, not `| null` — undefined is what
  // mergeScalarField treats as "no info" either way.
  const originalCurrency = pickEnum(extracted.original_currency, CURRENCIES) ?? undefined;

  return {
    scenario_group: canonicalizeScenarioGroup(
      extracted.scenario_group,
      existingScenarioGroups,
    ),
    shipment_mode: pickEnum(extracted.shipment_mode, SHIPMENT_MODES),
    shipment_type: pickEnum(extracted.shipment_type, SHIPMENT_TYPES),
    origin: cleanExtractedText(extracted.origin) ?? null,
    destination: cleanExtractedText(extracted.destination) ?? null,
    incoterm: pickEnum(extracted.incoterm, INCOTERMS),

    actual_weight_kg: extracted.actual_weight_kg ?? null,
    chargeable_weight_kg: extracted.chargeable_weight_kg ?? null,
    cbm: extracted.cbm ?? null,
    cost_of_goods_usd: extracted.cost_of_goods_usd ?? null,

    original_currency: originalCurrency,
    original_amount: extracted.original_amount ?? null,
    // USD short-circuit: a USD quote's rate is definitionally 1, so any rate
    // the model attached to a USD quote is discarded outright rather than
    // shown — there is no legitimate non-1 rate for a USD-denominated quote,
    // and this removes a whole class of hallucination deterministically
    // rather than relying on the prompt alone.
    exchange_rate_to_usd:
      originalCurrency === "USD" ? undefined : extracted.exchange_rate_to_usd ?? undefined,

    duties_taxes_usd: extracted.duties_taxes_usd ?? null,
    other_charges_usd: extracted.other_charges_usd ?? null,
    other_charges_description:
      cleanExtractedText(extracted.other_charges_description) ?? null,

    lead_time_min_days: extracted.lead_time_min_days ?? null,
    lead_time_max_days: extracted.lead_time_max_days ?? null,
    quote_date: pickDate(extracted.quote_date),
    rate_valid_until: pickDate(extracted.rate_valid_until),
    quote_reference: cleanExtractedText(extracted.quote_reference) ?? null,
  };
}

// currentValues, when passed, puts this call in "merge mode" (editing an
// existing quote) rather than blank-slate prefill (Add Quote, which has no
// existing record to compare against).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information.";

export async function extractQuoteDetails(
  formData: FormData,
  existingScenarioGroups: string[],
  currentValues?: ExtractedQuoteFields,
): Promise<ExtractQuoteState> {
  const file = formData.get("document") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    console.error("extractQuoteDetails: file parsing failed", err);
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
    "You extract structured freight-quote data for a forwarder sourcing tool from freeform notes, rate-sheet emails, or quote documents. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, estimate, or fabricate a value — omit any field that isn't clearly present, even a numeric one. Never output filler text like 'unknown' or 'N/A' for a field you can't confidently fill — omit the field instead.";

  if (existingScenarioGroups.length > 0) {
    systemPrompt += ` EXISTING SCENARIO GROUPS already used on this project: ${JSON.stringify(existingScenarioGroups)}. If this document describes the same lane/scenario as one of these, reuse that exact string for scenario_group rather than writing new text.`;
  }

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

  return { fields: toExtractedQuoteFields(result.input, existingScenarioGroups) };
}
