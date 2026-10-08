"use server";

import { extractTextFromFile, runExtractionTool } from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import {
  EXTRACTABLE_FIELD_KEYS,
  type ExtractedQuoteFields,
} from "@/lib/forwarder/merge-quote-fields";
import {
  toExtractedQuoteFields,
  type ExtractedQuoteIntake,
} from "@/lib/forwarder/extraction-mapping";
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

// currentValues, when passed, puts this call in "merge mode" (editing an
// existing quote) rather than blank-slate prefill (Add Quote, which has no
// existing record to compare against).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information.";

export async function extractQuoteDetails(
  formData: FormData,
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

  let currentValuesForPrompt: Record<string, unknown> | undefined;
  if (currentValues) {
    systemPrompt += MERGE_MODE_INSTRUCTION;
    currentValuesForPrompt = pickNonNull(currentValues, EXTRACTABLE_FIELD_KEYS);
  }

  const result = await runExtractionTool<ExtractedQuoteIntake>(
    text,
    EXTRACT_TOOL,
    systemPrompt,
    currentValuesForPrompt,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { fields: toExtractedQuoteFields(result.input) };
}
