import { describe, expect, test } from "vitest";
import {
  buildForwarderReport,
  buildForwarderReportCsv,
  type ExportVersion,
  type ForwarderReportData,
  type QuoteExportFields,
} from "./report-data";
import { renderForwarderReportPdf } from "./render-report-pdf";
import { renderForwarderReportDocx } from "./render-report-docx";
import type { ForwarderFields } from "./parse-forwarder-form";
import type { ForwarderQuoteResult } from "./cost-comparison";

// Client export leak test: every expert-only value, and everything about an
// excluded forwarder, carries a unique sentinel. The rendered Client CSV, PDF
// (text via pdf-parse), and DOCX (text via mammoth) must contain none of
// them; the Expert versions must contain all of them, so a sentinel that
// silently never renders can't make the client check pass by accident.
// Sentinels are letters only, and text is compared with whitespace removed,
// so a line wrap inside a value can't hide one.

const EXPERT_ONLY = {
  projectStatus: "ZZLEAKProjectStatus",
  contactPerson: "ZZLEAKContactPerson",
  contactPosition: "ZZLEAKContactPosition",
  email: "ZZLEAKEmail",
  phone: "ZZLEAKPhone",
  forwarderStatus: "ZZLEAKForwarderStatus",
  assessment: "ZZLEAKAssessment",
  nextAction: "ZZLEAKNextAction",
  keyNotes: "ZZLEAKKeyNotes",
  quoteForwarderStatus: "ZZLEAKQuoteForwarderStatus",
  keyStrength: "ZZLEAKKeyStrength",
  keyWeakness: "ZZLEAKKeyWeakness",
  assumption: "ZZLEAKAssumption",
  overallAssessment: "ZZLEAKOverallAssessment",
  clientDecision: "ZZLEAKClientDecision",
  quoteNotes: "ZZLEAKQuoteNotes",
};

// An excluded (Unfit) forwarder: none of it may reach the client version,
// not even its client-tier fields.
const EXCLUDED = {
  forwarderName: "ZZLEAKExcludedForwarderName",
  headquarters: "ZZLEAKExcludedHeadquarters",
  scenarioGroup: "ZZLEAKExcludedQuoteScenario",
  keyStrength: "ZZLEAKExcludedQuoteStrength",
};

// Client-safe values that must appear in every version.
const CLIENT_SAFE = {
  clientName: "ZZOKClientName",
  cargo: "ZZOKCargoDescription",
  forwarderName: "ZZOKForwarderName",
  headquarters: "ZZOKHeadquarters",
  scenarioGroup: "ZZOKScenario",
};

const capabilities = {
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
};

// Status-like fields are fixed option lists in the app; the renderers don't
// validate them, so a sentinel goes in through a cast.
const finalist = {
  company_name: CLIENT_SAFE.forwarderName,
  website: null,
  headquarters: CLIENT_SAFE.headquarters,
  footprint: null,
  contact_person: EXPERT_ONLY.contactPerson,
  contact_position: EXPERT_ONLY.contactPosition,
  email: EXPERT_ONLY.email,
  phone: EXPERT_ONLY.phone,
  origin_coverage: null,
  destination_coverage: null,
  other_services: null,
  ...capabilities,
  status: EXPERT_ONLY.forwarderStatus,
  assessment: EXPERT_ONLY.assessment,
  next_action: EXPERT_ONLY.nextAction,
  key_notes: EXPERT_ONLY.keyNotes,
} as unknown as ForwarderFields;

const excludedForwarder: ForwarderFields = {
  company_name: EXCLUDED.forwarderName,
  website: null,
  headquarters: EXCLUDED.headquarters,
  footprint: null,
  contact_person: null,
  contact_position: null,
  email: null,
  phone: null,
  origin_coverage: null,
  destination_coverage: null,
  other_services: null,
  ...capabilities,
  status: "Unfit",
  assessment: null,
  next_action: null,
  key_notes: null,
};

function quoteResult(quote: Partial<QuoteExportFields>): ForwarderQuoteResult<QuoteExportFields> {
  return {
    quote: {
      id: "q",
      forwarder_id: "f",
      forwarder_name: CLIENT_SAFE.forwarderName,
      forwarder_status: "Vetted",
      scenario_group: CLIENT_SAFE.scenarioGroup,
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
      key_strength: null,
      key_weakness_risk: null,
      important_assumption: null,
      overall_assessment: null,
      client_decision: null,
      notes: null,
      ...quote,
    } as unknown as QuoteExportFields,
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
  clientName: CLIENT_SAFE.clientName,
  route: null,
  projectRow: {
    clientName: CLIENT_SAFE.clientName,
    businessModel: null,
    status: EXPERT_ONLY.projectStatus,
    cargo_description: CLIENT_SAFE.cargo,
  },
  forwarders: [finalist, excludedForwarder],
  quoteResults: [
    quoteResult({
      forwarder_status: EXPERT_ONLY.quoteForwarderStatus,
      key_strength: EXPERT_ONLY.keyStrength,
      key_weakness_risk: EXPERT_ONLY.keyWeakness,
      important_assumption: EXPERT_ONLY.assumption,
      overall_assessment: EXPERT_ONLY.overallAssessment as never,
      client_decision: EXPERT_ONLY.clientDecision as never,
      notes: EXPERT_ONLY.quoteNotes,
    }),
    quoteResult({
      forwarder_name: EXCLUDED.forwarderName,
      forwarder_status: "Unfit",
      scenario_group: EXCLUDED.scenarioGroup,
      key_strength: EXCLUDED.keyStrength,
    }),
  ],
};

// The duty estimate travels only in the Expert CSV: never in a client export,
// and not yet in the Expert PDF/DOCX (docs/TECH_DEBT.md).
const DUTY_ESTIMATE_SENTINEL = "ZZLEAKDutyEstimateProgram";
data.dutyEstimates = new Map([
  [
    "q",
    {
      estimateId: "e1",
      quoteId: "q",
      asOfDate: "2026-10-05",
      entryDate: "2026-11-08",
      totalUsd: 3000,
      excludedCount: 1,
      pendingReview: [DUTY_ESTIMATE_SENTINEL],
      lastReviewedOn: null,
      comparison: null,
      changes: [],
      earlierCount: 0,
    },
  ],
]);

const MUST_NOT_REACH_CLIENT = [...Object.values(EXPERT_ONLY), ...Object.values(EXCLUDED)];

async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

async function docxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ buffer })).value;
}

const renderers: Record<"CSV" | "PDF" | "DOCX", (version: ExportVersion) => Promise<string>> = {
  CSV: async (version) => buildForwarderReportCsv(data, version),
  PDF: async (version) => pdfText(await renderForwarderReportPdf(buildForwarderReport(data, version))),
  DOCX: async (version) => docxText(await renderForwarderReportDocx(buildForwarderReport(data, version))),
};

const squash = (text: string) => text.replace(/\s+/g, "");

describe.each(Object.keys(renderers) as (keyof typeof renderers)[])("%s export", (format) => {
  test("client version contains no expert-only value and nothing about an excluded forwarder", async () => {
    const text = squash(await renderers[format]("client"));
    for (const value of Object.values(CLIENT_SAFE)) expect(text).toContain(value);
    const leaked = MUST_NOT_REACH_CLIENT.filter((sentinel) => text.includes(sentinel));
    expect(leaked).toEqual([]);
  }, 15000);

  test("expert version contains every one of them", async () => {
    const text = squash(await renderers[format]("expert"));
    for (const value of Object.values(CLIENT_SAFE)) expect(text).toContain(value);
    const missing = MUST_NOT_REACH_CLIENT.filter((sentinel) => !text.includes(sentinel));
    expect(missing).toEqual([]);
  }, 15000);

  // An unticked capability means "not yet confirmed"; a "No" would read to a
  // client as "can't do it".
  test.each(["client", "expert"] as const)(
    "%s version shows unconfirmed capabilities as Not confirmed",
    async (version) => {
      const text = await renderers[format](version);
      expect(squash(text)).toContain("Notconfirmed");
      if (format === "CSV") expect(text).not.toMatch(/(^|,)No(,|\r?$)/m);
    },
    15000,
  );
});

describe("duty estimates in exports", () => {
  test.each([
    ["CSV", "client"],
    ["PDF", "client"],
    ["DOCX", "client"],
    ["PDF", "expert"],
    ["DOCX", "expert"],
  ] as const)("%s %s version has no duty estimate", async (format, version) => {
    const text = squash(await renderers[format](version));
    expect(text).not.toContain(DUTY_ESTIMATE_SENTINEL);
    expect(text).not.toContain("DutyEstimate");
  }, 15000);

  test("the Expert CSV has the estimate, its as-of date, its entry date and its labels", async () => {
    const csv = await renderers.CSV("expert");
    expect(csv).toContain("Duty Estimate (USD),Duty Estimate As Of,Duty Estimate Entry Date,Duty Estimate Labels");
    const row = csv.split("\r\n").find((line) => line.includes(DUTY_ESTIMATE_SENTINEL));
    expect(row).toContain(',"$3,000.00","Oct 5, 2026","Nov 8, 2026",EXCLUDES 1 additional duty program that may apply; Pending expert review: ');
    expect(row).toContain("; Estimate — verify with your customs broker.");
    expect(csv).toContain("Duty estimates are informational");
  });
});
