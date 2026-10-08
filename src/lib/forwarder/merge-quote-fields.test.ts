import { describe, expect, test } from "vitest";
import { mergeQuoteFields } from "./merge-quote-fields";
import { describeMergeRules } from "@/lib/test-support/merge-checks";
import type { QuoteFormDefaults } from "@/app/(authenticated)/forwarder-sourcing/[id]/forwarders/[forwarderId]/quotes/quote-form";

const current: QuoteFormDefaults = {
  shipment_mode: "Sea",
  shipment_type: "FCL",
  origin: "Shenzhen",
  destination: "Los Angeles",
  incoterm: "FOB",
  actual_weight_kg: 1000,
  chargeable_weight_kg: 1200,
  cbm: 10,
  cost_of_goods_usd: 50000,
  original_currency: "EUR",
  original_amount: 3000,
  exchange_rate_to_usd: 1.1,
  exchange_rate_source: "forwarder_document",
  exchange_rate_date: "2026-09-30",
  duties_taxes_usd: 200,
  other_charges_usd: 50,
  other_charges_description: "Docs fee",
  lead_time_min_days: 20,
  lead_time_max_days: 30,
  quote_completeness: "Complete / Comparable",
  quote_date: "2026-09-30",
  rate_valid_until: "2026-10-31",
  quote_reference: "Q-123",
  key_strength: "Fast",
  key_weakness_risk: "Pricey",
  important_assumption: "Port congestion",
  overall_assessment: "Fit",
  client_decision: "Pending",
  notes: "Internal note",
};

describeMergeRules("mergeQuoteFields", mergeQuoteFields, current, {
  // The user's own judgment calls; the extraction tool never sets them.
  protectedKeys: [
    "quote_completeness",
    "overall_assessment",
    "client_decision",
    "exchange_rate_source",
    "exchange_rate_date",
  ],
  textKeys: [
    "origin",
    "destination",
    "other_charges_description",
    "quote_reference",
    "key_strength",
    "key_weakness_risk",
    "important_assumption",
    "notes",
  ],
});

describe("mergeQuoteFields: mode and type", () => {
  test("a new mode that the current type doesn't fit clears the type and marks it Updated", () => {
    const { merged, changed } = mergeQuoteFields(current, { shipment_mode: "Air" } as never);
    expect(merged.shipment_mode).toBe("Air");
    expect(merged.shipment_type).toBeNull();
    expect([...changed].sort()).toEqual(["shipment_mode", "shipment_type"]);
  });

  test("a new mode and a matching type are both applied", () => {
    const { merged, changed } = mergeQuoteFields(current, {
      shipment_mode: "Air",
      shipment_type: "Courier",
    } as never);
    expect(merged).toMatchObject({ shipment_mode: "Air", shipment_type: "Courier" });
    expect([...changed].sort()).toEqual(["shipment_mode", "shipment_type"]);
  });

  test("numbers: a changed amount is applied, the same amount isn't marked", () => {
    expect([...mergeQuoteFields(current, { original_amount: 3000 } as never).changed]).toEqual([]);
    const { merged, changed } = mergeQuoteFields(current, { original_amount: 3500 } as never);
    expect(merged.original_amount).toBe(3500);
    expect([...changed]).toEqual(["original_amount"]);
  });
});
