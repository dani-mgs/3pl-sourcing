import { CHIP_SEPARATOR } from "@/lib/chip-value";
import { cleanExtractedText } from "@/lib/document-extraction";
import type { ExtractedExistingProvider } from "@/lib/existing-provider-prefill";
import type { ExtractedProviderFields } from "@/lib/merge-provider-fields";
import type { ClientIntakeFields } from "@/components/client-intake-form";

// Turns the 3PL extraction tools' raw output into form values. Every text
// value goes through cleanExtractedText, same as the forwarder paths, so the
// model's own filler ("N/A", "Unknown", "") never reaches a form field or
// overwrites a real value in merge mode. Kept out of the "use server" action
// files so it can be unit tested.

export const CORE_COST_CATEGORY_PRESETS = [
  "Storage",
  "Pick & Pack",
  "Receiving",
  "Returns",
  "Kitting",
];

export const KEY_CAPABILITY_PRESETS = [
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

export type ExtractedIntake = {
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
  existing_provider?: {
    company_name?: string;
    location?: string;
    storage_cost?: number;
    pick_pack_cost?: number;
    receiving_cost?: number;
    returns_cost?: number;
  };
};

const PROVIDER_TEXT_KEYS = [
  "company_name",
  "provider_type",
  "website",
  "location",
  "footprint_source",
  "contact_person",
  "email",
  "phone",
  "virtual_tour_url",
  "billing_terms",
  "other_specialization",
] as const satisfies readonly (keyof ExtractedProviderFields)[];

const PROVIDER_NUMBER_KEYS = [
  "onboarding_period_months",
  "storage_cost",
  "pick_pack_cost",
  "receiving_cost",
  "returns_cost",
] as const satisfies readonly (keyof ExtractedProviderFields)[];

const PROVIDER_CAPABILITY_KEYS = [
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
] as const satisfies readonly (keyof ExtractedProviderFields)[];

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Only the tool's own keys survive (so a stray status/assessment can't ride
// along), text is cleaned, and a capability is kept only when it's true —
// the tool never asserts a capability is absent.
export function cleanProviderExtraction(raw: ExtractedProviderFields): ExtractedProviderFields {
  const input = raw as Record<string, unknown>;
  const result: ExtractedProviderFields = {};
  for (const key of PROVIDER_TEXT_KEYS) {
    const value = input[key];
    const cleaned = typeof value === "string" ? cleanExtractedText(value) : undefined;
    if (cleaned !== undefined) result[key] = cleaned;
  }
  for (const key of PROVIDER_NUMBER_KEYS) {
    const value = pickNumber(input[key]);
    if (value !== undefined) result[key] = value;
  }
  for (const key of PROVIDER_CAPABILITY_KEYS) {
    if (input[key] === true) result[key] = true;
  }
  return result;
}

function cleanText(value: string | undefined): string | null {
  return cleanExtractedText(value) ?? null;
}

export function toClientIntakeFields(extracted: ExtractedIntake): ClientIntakeFields {
  const costCategories = (extracted.core_cost_categories ?? []).filter((v) =>
    CORE_COST_CATEGORY_PRESETS.includes(v),
  );
  const capabilities = (extracted.key_capability_needs ?? []).filter((v) =>
    KEY_CAPABILITY_PRESETS.includes(v),
  );

  return {
    target_geography: cleanText(extracted.target_geography),
    avg_monthly_orders: extracted.avg_monthly_orders ?? null,
    peak_monthly_orders: extracted.peak_monthly_orders ?? null,
    latest_month_orders: extracted.latest_month_orders ?? null,
    avg_monthly_units: extracted.avg_monthly_units ?? null,
    peak_monthly_units: extracted.peak_monthly_units ?? null,
    // Not read from documents; set by hand.
    contract_period_months: null,
    benchmark_period: cleanText(extracted.benchmark_period),
    core_cost_categories:
      costCategories.length > 0 ? costCategories.join(CHIP_SEPARATOR) : null,
    key_capability_needs:
      capabilities.length > 0 ? capabilities.join(CHIP_SEPARATOR) : null,
    main_decision_focus: cleanText(extracted.main_decision_focus),
    tech_integration_requirement: cleanText(extracted.tech_integration_requirement),
    special_handling_requirement: cleanText(extracted.special_handling_requirement),
    fixed_comparison_principle: cleanText(extracted.fixed_comparison_principle),
    important_limitation: cleanText(extracted.important_limitation),
    assumptions_data_limitations: cleanText(extracted.assumptions_data_limitations),
  };
}

export function toExistingProvider(
  extracted: ExtractedIntake,
): ExtractedExistingProvider | undefined {
  const provider = extracted.existing_provider;
  const companyName = cleanExtractedText(provider?.company_name);
  if (!provider || !companyName) {
    return undefined;
  }

  return {
    company_name: companyName,
    location: cleanText(provider.location),
    storage_cost: provider.storage_cost ?? null,
    pick_pack_cost: provider.pick_pack_cost ?? null,
    receiving_cost: provider.receiving_cost ?? null,
    returns_cost: provider.returns_cost ?? null,
  };
}
