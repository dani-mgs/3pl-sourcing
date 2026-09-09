"use server";

import Anthropic from "@anthropic-ai/sdk";
import { CHIP_SEPARATOR } from "@/lib/chip-value";
import type { ClientIntakeFields } from "@/components/client-intake-form";

export type ExtractIntakeState =
  | { fields: ClientIntakeFields }
  | { error: string };

const CORE_COST_CATEGORY_PRESETS = [
  "Storage",
  "Pick & Pack",
  "Receiving",
  "Returns",
  "Kitting",
];

const KEY_CAPABILITY_PRESETS = [
  "Receiving",
  "Storage",
  "Fulfillment (Pick, Check, Pack)",
  "Dispatch",
  "Adhoc Kitting / Bundling",
  "Adhoc Labelling",
  "Returns",
  "Annual Inventory Count",
  "Cycle Count",
  "Inventory Count upon Request",
  "One Time System Set-up",
  "Lot / Batch / Expiry Tracking",
  "Temperature-Controlled Storage",
  "Retail / EDI Compliance",
  "Cross-Docking",
];

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

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
    },
  },
};

type ExtractedIntake = {
  client_name?: string;
  business_model?: string;
  target_geography?: string;
  avg_monthly_orders?: number;
  peak_monthly_orders?: number;
  latest_month_orders?: number;
  avg_monthly_units?: number;
  peak_monthly_units?: number;
  benchmark_period?: string;
  core_cost_categories?: string[];
  key_capability_needs?: string[];
  main_decision_focus?: string;
  tech_integration_requirement?: string;
  special_handling_requirement?: string;
  fixed_comparison_principle?: string;
  important_limitation?: string;
  assumptions_data_limitations?: string;
};

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  if (name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error("Unsupported file type. Please upload a .txt, .pdf, or .docx file.");
}

function toClientIntakeFields(extracted: ExtractedIntake): ClientIntakeFields {
  const costCategories = (extracted.core_cost_categories ?? []).filter((v) =>
    CORE_COST_CATEGORY_PRESETS.includes(v),
  );
  const capabilities = (extracted.key_capability_needs ?? []).filter((v) =>
    KEY_CAPABILITY_PRESETS.includes(v),
  );

  return {
    client_name: extracted.client_name ?? null,
    business_model: extracted.business_model ?? null,
    target_geography: extracted.target_geography ?? null,
    avg_monthly_orders: extracted.avg_monthly_orders ?? null,
    peak_monthly_orders: extracted.peak_monthly_orders ?? null,
    latest_month_orders: extracted.latest_month_orders ?? null,
    avg_monthly_units: extracted.avg_monthly_units ?? null,
    peak_monthly_units: extracted.peak_monthly_units ?? null,
    benchmark_period: extracted.benchmark_period ?? null,
    core_cost_categories:
      costCategories.length > 0 ? costCategories.join(CHIP_SEPARATOR) : null,
    key_capability_needs:
      capabilities.length > 0 ? capabilities.join(CHIP_SEPARATOR) : null,
    main_decision_focus: extracted.main_decision_focus ?? null,
    tech_integration_requirement: extracted.tech_integration_requirement ?? null,
    special_handling_requirement: extracted.special_handling_requirement ?? null,
    fixed_comparison_principle: extracted.fixed_comparison_principle ?? null,
    important_limitation: extracted.important_limitation ?? null,
    assumptions_data_limitations: extracted.assumptions_data_limitations ?? null,
  };
}

export async function extractClientIntake(
  formData: FormData,
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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("extractClientIntake: ANTHROPIC_API_KEY is not configured");
    return { error: "Document extraction isn't configured right now." };
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      system:
        "You extract structured client-intake data for a 3PL (third-party logistics) sourcing tool from freeform notes or documents. Only record a field if the source text clearly and confidently states it. Never guess, infer beyond what's written, or fabricate a value — omit any field that isn't clearly present. For the two list fields, only use values from the enum options given; do not invent new category labels.",
      messages: [{ role: "user", content: text.slice(0, 50_000) }],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { error: "Couldn't extract any usable details from that document." };
    }

    const fields = toClientIntakeFields(toolUse.input as ExtractedIntake);
    return { fields };
  } catch (err) {
    console.error("extractClientIntake: Anthropic API call failed", err);
    return { error: "Document extraction failed. You can still fill in the form manually." };
  }
}
