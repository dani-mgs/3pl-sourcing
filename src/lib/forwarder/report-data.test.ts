import { describe, expect, test } from "vitest";
import {
  buildSectionTable,
  filterQuotesForVersion,
  forwarderColumns,
  quoteColumns,
  type QuoteExportFields,
} from "./report-data";
import type { ForwarderFields } from "./parse-forwarder-form";
import type { ForwarderQuoteResult } from "./cost-comparison";

// buildSectionTable and filterQuotesForVersion are the one place client/expert
// tier filtering and excluded-status-quote filtering live, shared by CSV, PDF,
// and DOCX export — exactly the "easy to get subtly wrong" logic worth
// automated coverage per docs/CODING_STANDARDS.md.

function forwarder(overrides: Partial<ForwarderFields> = {}): ForwarderFields {
  return {
    company_name: "Acme Forwarding",
    website: null,
    headquarters: null,
    footprint: null,
    contact_person: "Jane Doe",
    contact_position: null,
    email: "jane@acme.example",
    phone: "+1 555 0100",
    origin_coverage: null,
    destination_coverage: null,
    other_services: null,
    air_freight: true,
    sea_freight: false,
    road_freight: false,
    fcl: false,
    lcl: false,
    courier_express: false,
    customs_brokerage: false,
    cargo_insurance: false,
    door_to_door: false,
    port_to_port: false,
    customs_import_assistance: false,
    status: "Vetted",
    assessment: null,
    next_action: null,
    key_notes: "Internal note",
    ...overrides,
  };
}

function quoteResult(
  overrides: Partial<QuoteExportFields> = {},
): ForwarderQuoteResult<QuoteExportFields> {
  const quote = {
    id: "q1",
    forwarder_id: "f1",
    forwarder_name: "Acme Forwarding",
    forwarder_status: "Vetted",
    scenario_group: "Lane A",
    shipment_mode: "Sea",
    shipment_type: "FCL",
    origin: null,
    destination: null,
    incoterm: "FOB",
    actual_weight_kg: null,
    chargeable_weight_kg: null,
    cbm: null,
    cost_of_goods_usd: null,
    original_currency: "USD",
    original_amount: 1000,
    exchange_rate_to_usd: 1,
    duties_taxes_usd: null,
    other_charges_usd: null,
    other_charges_description: null,
    lead_time_min_days: null,
    lead_time_max_days: null,
    quote_completeness: null,
    quote_date: null,
    rate_valid_until: null,
    quote_reference: null,
    key_strength: "Reliable",
    key_weakness_risk: null,
    important_assumption: null,
    overall_assessment: null,
    client_decision: null,
    notes: null,
    ...overrides,
  } as unknown as QuoteExportFields;

  return {
    quote,
    freightCostUsd: 1000,
    costPerKg: null,
    freightCostRatio: null,
    totalComparableLogisticsCost: null,
    estimatedAnnualFreightCost: null,
    costDifference: null,
    savingPct: null,
    annualCostDifference: null,
    annualSavingsPct: null,
    vsBaseline: null,
    costRank: 1,
    rankPosition: "Only Comparable Quote",
  };
}

describe("buildSectionTable", () => {
  test("client tier excludes expert-only columns", () => {
    const table = buildSectionTable(forwarderColumns(), "client", [forwarder()]);
    expect(table.headers).not.toContain("Email");
    expect(table.headers).not.toContain("Phone");
    expect(table.headers).not.toContain("Contact Person");
    expect(table.headers).not.toContain("Key Notes");
    expect(table.headers).toContain("Company Name");
  });

  test("expert tier includes every column", () => {
    const table = buildSectionTable(forwarderColumns(), "expert", [forwarder()]);
    expect(table.headers).toContain("Email");
    expect(table.headers).toContain("Phone");
    expect(table.headers).toContain("Key Notes");
  });

  test("row values line up with the filtered headers, not the full column list", () => {
    const table = buildSectionTable(forwarderColumns(), "client", [
      forwarder({ company_name: "Beta Logistics" }),
    ]);
    const nameIndex = table.headers.indexOf("Company Name");
    expect(table.rows[0][nameIndex]).toBe("Beta Logistics");
  });
});

describe("filterQuotesForVersion", () => {
  test("drops an excluded-status forwarder's quote for the client version", () => {
    const results = [
      quoteResult({ forwarder_status: "Vetted" }),
      quoteResult({ forwarder_status: "Unfit" }),
    ];
    const filtered = filterQuotesForVersion(results, "client");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].quote.forwarder_status).toBe("Vetted");
  });

  test("keeps every quote, including excluded-status ones, for the expert version", () => {
    const results = [
      quoteResult({ forwarder_status: "Vetted" }),
      quoteResult({ forwarder_status: "Do Not Contact" }),
    ];
    expect(filterQuotesForVersion(results, "expert")).toHaveLength(2);
  });
});

describe("quoteColumns tier filtering", () => {
  test("client tier omits internal assessment fields", () => {
    const table = buildSectionTable(quoteColumns(), "client", [quoteResult()]);
    expect(table.headers).not.toContain("Key Strength");
    expect(table.headers).not.toContain("Forwarder Status");
    expect(table.headers).toContain("Freight Cost (USD)");
  });

  test("expert tier includes internal assessment fields", () => {
    const table = buildSectionTable(quoteColumns(), "expert", [quoteResult()]);
    expect(table.headers).toContain("Key Strength");
    expect(table.headers).toContain("Forwarder Status");
  });
});
