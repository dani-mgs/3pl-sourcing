"use server";

import {
  cleanExtractedText,
  extractTextFromFile,
  runExtractionTool,
} from "@/lib/document-extraction";
import { pickNonNull } from "@/lib/merge-fields";
import {
  EXTRACTABLE_FIELD_KEYS,
  type ExtractedForwarderFields,
} from "@/lib/forwarder/merge-forwarder-fields";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";

export type ExtractForwarderState =
  | { fields: ExtractedForwarderFields; company_name?: string }
  | { error: string };

const capabilityProperties = Object.fromEntries(
  CAPABILITY_FIELDS.map((c) => [
    c.name,
    {
      type: "boolean",
      description: `Only include if the document explicitly confirms this forwarder DOES or DOES NOT offer "${c.label}". If it isn't mentioned at all, omit this field entirely — never default it to false.`,
    },
  ]),
);

const EXTRACT_TOOL = {
  name: "record_forwarder_details",
  description:
    "Record forwarder company/capability details found in the source document. Only include fields the text actually and clearly states — omit anything not confidently present. Never guess, estimate, or fabricate a value. For each capability boolean, only include it when the document explicitly confirms the forwarder either has or does not have that capability — silence about a capability means omit it, never assume false. Never output a placeholder like 'unknown', 'N/A', or similar for a field you couldn't confidently fill — omit it entirely instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      company_name: { type: "string" },
      website: { type: "string" },
      headquarters: { type: "string" },
      footprint: { type: "string" },
      contact_person: { type: "string" },
      contact_position: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      origin_coverage: { type: "string" },
      destination_coverage: { type: "string" },
      other_services: { type: "string" },
      ...capabilityProperties,
    },
  },
};

type ExtractedIntake = {
  company_name?: string;
  website?: string;
  headquarters?: string;
  footprint?: string;
  contact_person?: string;
  contact_position?: string;
  email?: string;
  phone?: string;
  origin_coverage?: string;
  destination_coverage?: string;
  other_services?: string;
} & Partial<Record<(typeof CAPABILITY_FIELDS)[number]["name"], boolean>>;

function toExtractedForwarderFields(
  extracted: ExtractedIntake,
): ExtractedForwarderFields {
  const fields: ExtractedForwarderFields = {
    website: cleanExtractedText(extracted.website) ?? null,
    headquarters: cleanExtractedText(extracted.headquarters) ?? null,
    footprint: cleanExtractedText(extracted.footprint) ?? null,
    contact_person: cleanExtractedText(extracted.contact_person) ?? null,
    contact_position: cleanExtractedText(extracted.contact_position) ?? null,
    email: cleanExtractedText(extracted.email) ?? null,
    phone: cleanExtractedText(extracted.phone) ?? null,
    origin_coverage: cleanExtractedText(extracted.origin_coverage) ?? null,
    destination_coverage:
      cleanExtractedText(extracted.destination_coverage) ?? null,
    other_services: cleanExtractedText(extracted.other_services) ?? null,
  };

  for (const capability of CAPABILITY_FIELDS) {
    const value = extracted[capability.name];
    if (typeof value === "boolean") {
      fields[capability.name] = value;
    }
  }

  return fields;
}

// currentValues, when passed, puts this call in "merge mode" (editing an
// existing forwarder) rather than blank-slate prefill (Add Forwarder, which
// has no existing record to compare against).
const MERGE_MODE_INSTRUCTION =
  " You will be given the record's CURRENT values alongside the document. Only include a field in your output if the document states a genuinely NEW or CHANGED value for it. If the document merely restates or confirms something that matches the current value (even if phrased differently), omit that field entirely — do not return a re-paraphrased version of unchanged information.";

export async function extractForwarderDetails(
  formData: FormData,
  currentValues?: ExtractedForwarderFields,
): Promise<ExtractForwarderState> {
  const file = formData.get("document") as File | null;

  if (!file || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    console.error("extractForwarderDetails: file parsing failed", err);
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
    "You extract structured company and capability data for a freight-forwarder sourcing tool from freeform notes, capability statements, emails, or documents about a specific forwarder. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, estimate, or fabricate a value — omit any field that isn't clearly present. Never output filler text like 'unknown' or 'N/A' for a field you can't confidently fill — omit the field instead.";

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

  const fields = toExtractedForwarderFields(result.input);
  const companyName = cleanExtractedText(result.input.company_name);

  return companyName ? { fields, company_name: companyName } : { fields };
}
