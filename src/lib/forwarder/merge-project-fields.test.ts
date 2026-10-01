import { describe, expect, test } from "vitest";
import { mergeForwarderProjectFields } from "./merge-project-fields";
import { describeMergeRules } from "@/lib/test-support/merge-checks";
import type { ForwarderProjectDefaults } from "@/app/(authenticated)/forwarder-sourcing/forwarder-project-form";

const current: ForwarderProjectDefaults = {
  status: "Active",
  origin_country: "China",
  origin_city: "Shenzhen",
  origin_port: "Yantian",
  destination_country: "United States",
  destination_city: "Los Angeles",
  destination_port: "LA",
  final_delivery_address: "1 Main St",
  cargo_description: "Tents",
  packaging_type: "Cartons",
  units: 1000,
  cartons: 100,
  pallets: 10,
  weight_kg: 2000,
  cbm: 20,
  stackable: "Yes",
  dangerous_goods: "No",
  temperature_controlled: "No",
  special_handling: "Keep dry",
  packing_list_available: "Yes",
  packing_list_reference: "PL-1",
  packing_list_notes: "Attached",
  current_incoterm: "FOB",
  shipment_mode: "Sea",
  shipment_type: "FCL",
  current_freight_cost_usd: 3000,
  current_freight_forwarder: "Old Co",
  current_lead_time_days: 30,
  shipments_per_month: 2,
  shipments_per_year: 24,
  incoterms_to_compare: ["FOB", "CIF"],
  final_incoterm: "FOB",
  final_shipment_mode: "Sea",
  final_shipment_type: "LCL",
  target_lead_time_days: 25,
  hs_code: "0401",
  invoice_value: 50000,
  invoice_currency: "USD",
  insurance_required: "Yes",
  brokerage_needed: "No",
};

describeMergeRules("mergeForwarderProjectFields", mergeForwarderProjectFields, current, {
  protectedKeys: ["status"],
  textKeys: [
    "origin_country",
    "origin_city",
    "origin_port",
    "destination_country",
    "destination_city",
    "destination_port",
    "final_delivery_address",
    "cargo_description",
    "packaging_type",
    "special_handling",
    "packing_list_reference",
    "packing_list_notes",
    "current_freight_forwarder",
    "hs_code",
  ],
});

describe("mergeForwarderProjectFields: mode/type pairs and incoterms", () => {
  test("each pair is re-checked: a final mode change clears an unfitting final type only", () => {
    const { merged, changed } = mergeForwarderProjectFields(current, {
      final_shipment_mode: "Road",
    } as never);
    expect(merged).toMatchObject({
      final_shipment_mode: "Road",
      final_shipment_type: null,
      shipment_mode: "Sea",
      shipment_type: "FCL",
    });
    expect([...changed].sort()).toEqual(["final_shipment_mode", "final_shipment_type"]);
  });

  test("the same incoterms in a different order aren't marked Updated", () => {
    const { changed } = mergeForwarderProjectFields(current, {
      incoterms_to_compare: ["CIF", "FOB"],
    } as never);
    expect([...changed]).toEqual([]);
  });

  test("a different incoterm set is applied in canonical order and marked Updated", () => {
    const { merged, changed } = mergeForwarderProjectFields(current, {
      incoterms_to_compare: ["DDP", "EXW"],
    } as never);
    expect(merged.incoterms_to_compare).toEqual(["EXW", "DDP"]);
    expect([...changed]).toEqual(["incoterms_to_compare"]);
  });

  test("an empty incoterm list never clears the current one", () => {
    const { merged, changed } = mergeForwarderProjectFields(current, {
      incoterms_to_compare: [],
    } as never);
    expect(merged.incoterms_to_compare).toEqual(["FOB", "CIF"]);
    expect([...changed]).toEqual([]);
  });
});
