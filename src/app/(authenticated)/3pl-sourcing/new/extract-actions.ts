"use server";

import {
  cleanExtractedText,
  extractTextFromFile,
  runExtractionTool,
} from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import type { ClientIntakeFields } from "@/components/client-intake-form";
import type { ExtractedExistingProvider } from "@/lib/existing-provider-prefill";
import {
  CORE_COST_CATEGORY_PRESETS,
  KEY_CAPABILITY_PRESETS,
  toClientIntakeFields,
  toExistingProvider,
  type ExtractedIntake,
} from "@/lib/three-pl/clean-extraction";
import { createClient } from "@/lib/supabase/server";
import { findClientByName, type ClientOption } from "@/lib/clients";

// `client` is the client the document names (New Project only): matchedClient
// is set when that name already exists, so the wizard preselects it instead
// of offering to create a duplicate. Merge mode (Project Info edit) never
// returns client details — they belong to the shared, admin-only client record.
export type ExtractIntakeState =
  | {
      fields: ClientIntakeFields;
      client?: { name: string; business_model: string | null };
      matchedClient?: ClientOption;
      existingProvider?: ExtractedExistingProvider;
    }
  | { error: string };

const EXTRACT_TOOL = {
  name: "record_client_intake",
  description:
    "Record client intake fields found in the source document. Only include fields the text actually and clearly states — omit anything not confidently present. Never guess or fabricate a value.",
  input_schema: {
    type: "object" as const,
    properties: {
      client_name: { type: "string" },
      business_model: { type: "string" },
      target_geography: { type: "string" },
      avg_monthly_orders: { type: "integer" },
      peak_monthly_orders: { type: "integer" },
      latest_month_orders: { type: "integer" },
      avg_monthly_units: { type: "integer" },
      peak_monthly_units: { type: "integer" },
      benchmark_period: { type: "string" },
      core_cost_categories: {
        type: "array",
        items: { type: "string", enum: CORE_COST_CATEGORY_PRESETS },
      },
      key_capability_needs: {
        type: "array",
        items: { type: "string", enum: KEY_CAPABILITY_PRESETS },
      },
      main_decision_focus: { type: "string" },
      tech_integration_requirement: { type: "string" },
      special_handling_requirement: { type: "string" },
      fixed_comparison_principle: { type: "string" },
      important_limitation: { type: "string" },
      assumptions_data_limitations: { type: "string" },
      existing_provider: {
        type: "object",
        description:
          "Only include this if the document clearly names a specific existing, current, or incumbent 3PL provider the client already uses. Never invent a provider that isn't actually named. Leave individual cost fields out if a specific number isn't given, even when the provider's name is known.",
        properties: {
          company_name: { type: "string" },
          location: { type: "string" },
          storage_cost: { type: "number" },
          pick_pack_cost: { type: "number" },
          receiving_cost: { type: "number" },
          returns_cost: { type: "number" },
        },
      },
    },
  },
};

// currentValues, when passed, puts this call in "merge mode" (the Project
// Info edit page updating an existing project) rather than blank-slate
// prefill (the New Project wizard, which has no existing record to compare
// against and always omits this argument).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information.";

export async function extractClientIntake(
  formData: FormData,
  currentValues?: ClientIntakeFields,
): Promise<ExtractIntakeState> {
  const file = formData.get("document") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    console.error("extractClientIntake: file parsing failed", err);
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
    "You extract structured client-intake data for a 3PL (third-party logistics) sourcing tool from freeform notes or documents. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, or fabricate a value — omit any field that isn't clearly present. For the two list fields, only use values from the enum options given; do not invent new category labels.";

  let currentValuesForPrompt: Record<string, unknown> | undefined;
  if (currentValues) {
    systemPrompt += MERGE_MODE_INSTRUCTION;
    currentValuesForPrompt = pickNonNull(currentValues, [
      "target_geography",
      "avg_monthly_orders",
      "peak_monthly_orders",
      "latest_month_orders",
      "avg_monthly_units",
      "peak_monthly_units",
      "benchmark_period",
      "core_cost_categories",
      "key_capability_needs",
      "main_decision_focus",
      "tech_integration_requirement",
      "special_handling_requirement",
      "fixed_comparison_principle",
      "important_limitation",
      "assumptions_data_limitations",
    ]);
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

  const fields = toClientIntakeFields(result.input);
  const existingProvider = toExistingProvider(result.input);
  const extras = existingProvider ? { existingProvider } : {};

  const clientName = cleanExtractedText(result.input.client_name);
  if (currentValues || !clientName) {
    return { fields, ...extras };
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
    ...extras,
  };
}
