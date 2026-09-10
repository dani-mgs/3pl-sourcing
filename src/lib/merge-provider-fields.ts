import { mergeScalarField } from "./merge-fields";
import type { ProviderFormDefaults } from "@/components/provider-form";

// Everything the extraction tool can populate. status, assessment_status, and
// is_incumbent are deliberately absent — those represent internal tracking
// judgment a user sets manually, never a fact pulled from a document.
export type ExtractedProviderFields = {
  company_name?: string;
  provider_type?: string;
  website?: string;
  location?: string;
  footprint_source?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  receiving?: boolean;
  storage?: boolean;
  fulfillment?: boolean;
  dispatch?: boolean;
  adhoc_kitting_bundling?: boolean;
  adhoc_labelling?: boolean;
  returns?: boolean;
  annual_inventory_count?: boolean;
  cycle_count?: boolean;
  inventory_count_on_request?: boolean;
  one_time_system_setup?: boolean;
  lot_batch_expiry_tracking?: boolean;
  temp_controlled_storage?: boolean;
  retail_edi_compliance?: boolean;
  cross_docking?: boolean;
  b2b?: boolean;
  b2c?: boolean;
  onboarding_period_months?: number;
  virtual_tour_url?: string;
  billing_terms?: string;
  other_specialization?: string;
  storage_cost?: number;
  pick_pack_cost?: number;
  receiving_cost?: number;
  returns_cost?: number;
};

const CAPABILITY_KEYS = [
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

export type ProviderMergeResult = {
  merged: ProviderFormDefaults;
  changed: Set<string>;
};

// Update-from-document merge for an existing 3PL: only overwrites a field when
// the document clearly stated a new value for it — anything not mentioned
// keeps the provider's existing value. Capability booleans only ever flip
// false -> true (a confirmed capability), never true -> false, since the
// extraction schema itself never asserts a capability is absent — silence
// isn't a signal, so removal stays a manual action. company_name is excluded
// for the same identity reason client_name is in mergeClientIntakeFields.
export function mergeProviderFields(
  current: ProviderFormDefaults,
  extracted: ExtractedProviderFields,
): ProviderMergeResult {
  const merged: ProviderFormDefaults = { ...current };
  const changed = new Set<string>();

  mergeScalarField(current, extracted, "provider_type", merged, changed);
  mergeScalarField(current, extracted, "website", merged, changed);
  mergeScalarField(current, extracted, "location", merged, changed);
  mergeScalarField(current, extracted, "footprint_source", merged, changed);
  mergeScalarField(current, extracted, "contact_person", merged, changed);
  mergeScalarField(current, extracted, "email", merged, changed);
  mergeScalarField(current, extracted, "phone", merged, changed);
  mergeScalarField(
    current,
    extracted,
    "onboarding_period_months",
    merged,
    changed,
  );
  mergeScalarField(current, extracted, "virtual_tour_url", merged, changed);
  mergeScalarField(current, extracted, "billing_terms", merged, changed);
  mergeScalarField(
    current,
    extracted,
    "other_specialization",
    merged,
    changed,
  );
  mergeScalarField(current, extracted, "storage_cost", merged, changed);
  mergeScalarField(current, extracted, "pick_pack_cost", merged, changed);
  mergeScalarField(current, extracted, "receiving_cost", merged, changed);
  mergeScalarField(current, extracted, "returns_cost", merged, changed);

  for (const key of CAPABILITY_KEYS) {
    if (extracted[key] === true && current[key] !== true) {
      merged[key] = true;
      changed.add(key);
    }
  }

  return { merged, changed };
}
