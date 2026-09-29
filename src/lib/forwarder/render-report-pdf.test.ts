import { describe, expect, test } from "vitest";
import { renderForwarderReportPdf } from "./render-report-pdf";
import { buildForwarderReport, type ForwarderReportData } from "./report-data";
import type { ForwarderFields } from "./parse-forwarder-form";
import type { QuoteExportFields } from "./report-data";
import type { ForwarderQuoteResult } from "./cost-comparison";

// Since a PDF can't be "read" visually, this round-trips the render through
// pdf-parse (already a project dependency, used for document-extraction) and
// asserts on the extracted plain text — a real, automated check that the
// client/expert filtering actually reaches the rendered file, not just the
// intermediate data structure covered by report-data.test.ts.

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
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

describe("renderForwarderReportPdf", () => {
  test("replaces the route arrow with an ASCII fallback instead of corrupting the glyph", async () => {
    // pdfkit's built-in Helvetica font can't render "→" (WinAnsiEncoding has
    // no glyph for it) — caught live as garbled text in the header. Regression
    // test for that fix.
    const report = buildForwarderReport(data, "client");
    const buffer = await renderForwarderReportPdf(report);
    const text = await extractText(buffer);

    expect(text).toContain("->");
    expect(text).not.toContain("→");
  }, 15000);


  test("client report omits forwarder contact info, internal notes, and excluded-status quotes", async () => {
    const report = buildForwarderReport(data, "client");
    const buffer = await renderForwarderReportPdf(report);
    const text = await extractText(buffer);

    expect(text).toContain("Acme Forwarding");
    expect(text).toContain("Cascade Outdoor Gear");
    expect(text).not.toContain("jane@acme.example");
    expect(text).not.toContain("+1 555 0100");
    expect(text).not.toContain("Jane Confidential");
    expect(text).not.toContain("Internal-only note");
    expect(text).not.toContain("SecretSauceStrength");
    expect(text).not.toContain("Excluded Freight Co");
  }, 15000);

  test("expert report includes contact info, internal notes, and excluded-status quotes", async () => {
    const report = buildForwarderReport(data, "expert");
    const buffer = await renderForwarderReportPdf(report);
    const text = await extractText(buffer);

    expect(text).toContain("jane@acme.example");
    expect(text).toContain("Internal-only note");
    expect(text).toContain("SecretSauceStrength");
    expect(text).toContain("Excluded Freight Co");
  }, 15000);
});
