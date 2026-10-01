import { describe, expect, test } from "vitest";
import { mergeProviderFields } from "./merge-provider-fields";
import { BLANK_RATE_DETAILS } from "./rate-details";
import { describeMergeRules } from "@/lib/test-support/merge-checks";
import type { ProviderFormDefaults } from "@/components/provider-form";

const current: ProviderFormDefaults = {
  ...BLANK_RATE_DETAILS,
  storage_rate: 12.5,
  company_name: "Acme 3PL",
  provider_type: "Fulfillment",
  website: "https://acme3pl.example",
  location: "Reno, NV",
  footprint_source: "Website",
  contact_person: "Sam Lee",
  email: "sam@acme3pl.example",
  phone: "+1 555 0101",
  receiving: true,
  storage: true,
  fulfillment: false,
  dispatch: false,
  adhoc_kitting_bundling: false,
  adhoc_labelling: false,
  returns: true,
  annual_inventory_count: false,
  cycle_count: false,
  inventory_count_on_request: false,
  one_time_system_setup: false,
  lot_batch_expiry_tracking: false,
  temp_controlled_storage: false,
  retail_edi_compliance: false,
  cross_docking: false,
  b2b: true,
  b2c: false,
  onboarding_period_months: 2,
  virtual_tour_url: "https://tour.example",
  billing_terms: "Net 30",
  other_specialization: "Apparel",
  is_incumbent: false,
  currency: "USD",
  storage_cost: 1200,
  pick_pack_cost: 800,
  receiving_cost: 300,
  returns_cost: 100,
  system_setup_cost: 500,
  inventory_on_request_cost: null,
  adhoc_bundling_kitting_cost: null,
  adhoc_labelling_cost: null,
  b2b_pick_pack_cost: null,
  status: "Vetted",
  assessment_status: "Strong",
  key_strength: "Fast",
  key_weakness_risk: "Small",
  important_assumption: "Volume",
  overall_assessment: "Good",
  client_decision: "Pending",
  source_basis: "Proposal",
  next_action: "Call",
  key_notes: "Internal",
  notes: "Notes",
};

describeMergeRules("mergeProviderFields", mergeProviderFields, current, {
  protectedKeys: [
    "company_name",
    "status",
    "assessment_status",
    "is_incumbent",
    "currency",
    "key_strength",
    "key_weakness_risk",
    "important_assumption",
    "overall_assessment",
    "client_decision",
    "source_basis",
    "next_action",
    "key_notes",
    "notes",
    "system_setup_cost",
    "storage_rate",
  ],
  textKeys: [
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
  ],
});

describe("mergeProviderFields: capabilities only switch on", () => {
  test("false from a document never switches a capability off", () => {
    const { merged, changed } = mergeProviderFields(current, { receiving: false, storage: false });
    expect(merged.receiving).toBe(true);
    expect(merged.storage).toBe(true);
    expect([...changed]).toEqual([]);
  });

  test("a newly confirmed capability is switched on and marked Updated", () => {
    const { merged, changed } = mergeProviderFields(current, { fulfillment: true, receiving: true });
    expect(merged.fulfillment).toBe(true);
    expect([...changed]).toEqual(["fulfillment"]);
  });

  test("a changed cost is applied and marked; the same cost isn't", () => {
    const { merged, changed } = mergeProviderFields(current, { storage_cost: 1300, pick_pack_cost: 800 });
    expect(merged.storage_cost).toBe(1300);
    expect([...changed]).toEqual(["storage_cost"]);
  });
});
