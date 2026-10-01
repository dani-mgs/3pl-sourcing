import { describe, expect, test } from "vitest";
import { renderForwarderReportDocx } from "./render-report-docx";
import { buildForwarderReport, type ForwarderReportData } from "./report-data";
import type { ForwarderFields } from "./parse-forwarder-form";
import type { QuoteExportFields } from "./report-data";
import type { ForwarderQuoteResult } from "./cost-comparison";

// Round-trips the render through mammoth (already a project dependency, used
// for document-extraction) so the client/expert filtering is verified against
// the actual rendered file, the same approach as render-report-pdf.test.ts.

const forwarder: ForwarderFields = {
  company_name: "Acme Forwarding",
  website: null,
  headquarters: "Rotterdam, Netherlands",
  footprint: null,
  contact_person: "Jane Confidential",
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
  key_notes: "Internal-only note",
};

function quoteResult(
  overrides: Partial<QuoteExportFields>,
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
    key_strength: "SecretSauceStrength",
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

const data: ForwarderReportData = {
  clientName: "Cascade Outdoor Gear",
  route: "Shenzhen, China → Los Angeles, United States",
  projectRow: {
    clientName: "Cascade Outdoor Gear",
    businessModel: "B2C Retail",
    status: "Active",
  },
  forwarders: [forwarder],
  quoteResults: [
    quoteResult({ forwarder_status: "Vetted" }),
    quoteResult({ forwarder_status: "Unfit", forwarder_name: "Excluded Freight Co" }),
  ],
};

async function extractText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

describe("renderForwarderReportDocx", () => {
  test("client report omits forwarder contact info, internal notes, and excluded-status quotes", async () => {
    const report = buildForwarderReport(data, "client");
    const buffer = await renderForwarderReportDocx(report);
    const text = await extractText(buffer);

    expect(text).toContain("Acme Forwarding");
    expect(text).toContain("Cascade Outdoor Gear");
    expect(text).not.toContain("jane@acme.example");
    expect(text).not.toContain("+1 555 0100");
    expect(text).not.toContain("Jane Confidential");
    expect(text).not.toContain("Internal-only note");
    expect(text).not.toContain("SecretSauceStrength");
    expect(text).not.toContain("Excluded Freight Co");
  });

  test("expert report includes contact info, internal notes, and excluded-status quotes", async () => {
    const report = buildForwarderReport(data, "expert");
    const buffer = await renderForwarderReportDocx(report);
    const text = await extractText(buffer);

    expect(text).toContain("jane@acme.example");
    expect(text).toContain("Internal-only note");
    expect(text).toContain("SecretSauceStrength");
    expect(text).toContain("Excluded Freight Co");
  });
});

describe("exchange rate provenance in the DOCX (client version)", () => {
  test("shows readable rate, date, and source labels plus the daily-feed note", async () => {
    const withRates: ForwarderReportData = {
      ...data,
      quoteResults: [
        quoteResult({ original_currency: "KRW", exchange_rate_to_usd: 0.000738, exchange_rate_source: "daily_feed", exchange_rate_date: "2026-10-01" } as Partial<QuoteExportFields>),
        quoteResult({ forwarder_name: "Legacy Freight", original_currency: "EUR", exchange_rate_to_usd: 1.1, exchange_rate_source: "manual_legacy", exchange_rate_date: null } as Partial<QuoteExportFields>),
      ],
    };
    const text = await extractText(await renderForwarderReportDocx(buildForwarderReport(withRates, "client")));
    expect(text).toContain("1 KRW = 0.000738 USD");
    expect(text).toContain("Oct 1, 2026");
    expect(text).toContain("Daily reference rate");
    expect(text).toContain("Entered manually (date not recorded)");
    expect(text).toContain("Daily reference rates: Frankfurter");
    expect(text).not.toContain("daily_feed");
    expect(text).not.toContain("manual_legacy");
  }, 15000);
});
