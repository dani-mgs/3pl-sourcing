import { describe, expect, test } from "vitest";
import {
  buildSectionTable,
  filterQuotesForVersion,
  forwarderColumns,
  quoteColumns,
  reportNotes,
  type QuoteExportFields,
} from "./report-data";
import { DAILY_FEED_ATTRIBUTION } from "@/lib/fx/rate-provenance";
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
    exchange_rate_source: null,
    exchange_rate_date: null,
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

describe("exchange rate columns", () => {
  function rateCells(overrides: Partial<QuoteExportFields>, version: "client" | "expert" = "client") {
    const table = buildSectionTable(quoteColumns(), version, [quoteResult(overrides)]);
    const at = (h: string) => table.rows[0][table.headers.indexOf(h)];
    return { rate: at("Exchange Rate"), date: at("Rate Date"), source: at("Rate Source"), headers: table.headers };
  }

  test("appear in both client and expert versions", () => {
    for (const version of ["client", "expert"] as const) {
      const { headers } = rateCells({}, version);
      expect(headers).toEqual(expect.arrayContaining(["Exchange Rate", "Rate Date", "Rate Source"]));
    }
  });

  test("blank for USD quotes", () => {
    expect(rateCells({})).toMatchObject({ rate: null, date: null, source: null });
  });

  test("readable rate, date, and source label for each source — never the stored code", () => {
    const base = { original_currency: "KRW", exchange_rate_to_usd: 0.000738 } as Partial<QuoteExportFields>;
    expect(rateCells({ ...base, exchange_rate_source: "daily_feed", exchange_rate_date: "2026-10-01" })).toMatchObject({
      rate: "1 KRW = 0.000738 USD",
      date: "Oct 1, 2026",
      source: "Daily reference rate",
    });
    expect(rateCells({ ...base, exchange_rate_source: "forwarder_document", exchange_rate_date: "2026-09-25" }).source).toBe(
      "Forwarder's quoted rate",
    );
    expect(rateCells({ ...base, exchange_rate_source: "manual", exchange_rate_date: "2026-10-01" }).source).toBe("Entered manually");
    expect(rateCells({ ...base, exchange_rate_source: "manual_legacy", exchange_rate_date: null })).toMatchObject({
      date: "Not recorded",
      source: "Entered manually (date not recorded)",
    });
  });
});

describe("reportNotes", () => {
  test("adds the daily-feed attribution only when an exported quote uses it", () => {
    const daily = quoteResult({ original_currency: "KRW", exchange_rate_source: "daily_feed", exchange_rate_date: "2026-10-01" } as Partial<QuoteExportFields>);
    const manual = quoteResult({ original_currency: "KRW", exchange_rate_source: "manual", exchange_rate_date: "2026-10-01" } as Partial<QuoteExportFields>);
    expect(reportNotes([daily, manual])).toEqual([DAILY_FEED_ATTRIBUTION]);
    expect(reportNotes([manual, quoteResult()])).toEqual([]);
  });
});
