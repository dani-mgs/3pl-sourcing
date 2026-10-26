import type { ForwarderQuoteResult } from "../cost-comparison";
import type { ForwarderFields } from "../parse-forwarder-form";
import type { ForwarderReportData, QuoteExportFields } from "../report-data";

// A forwarder project for the Expert CSV's duty estimates: one forwarder,
// one quote ("q", which quotes $2,500.00 of duties), and stored duty
// estimate rows as duty_estimates holds them (numerics as strings, warnings
// and reviews as saved). Test-only.

const forwarder = {
  company_name: "Acme Freight",
  website: null,
  headquarters: "Rotterdam",
  footprint: null,
  contact_person: null,
  contact_position: null,
  email: null,
  phone: null,
  origin_coverage: null,
  destination_coverage: null,
  other_services: null,
  air_freight: false,
  sea_freight: true,
  road_freight: false,
  fcl: true,
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
  key_notes: null,
} as unknown as ForwarderFields;

const quote: ForwarderQuoteResult<QuoteExportFields> = {
  quote: {
    id: "q",
    forwarder_id: "f",
    forwarder_name: "Acme Freight",
    forwarder_status: "Vetted",
    scenario_group: null,
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
    duties_taxes_usd: 2500,
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

export const baseData = (): ForwarderReportData => ({
  clientName: "Pakkable Co",
  route: null,
  projectRow: { clientName: "Pakkable Co", businessModel: null, status: "Active", cargo_description: "T-shirts" },
  forwarders: [forwarder],
  quoteResults: [quote],
});

// One pending program left out of the total (incomplete), as the Tariff
// Calculator saves it.
const PENDING_WARNING = {
  programKey: "section_301_forced_labor",
  name: "Section 301 (forced labour)",
  kind: "pending_review",
  text: "Section 301 forced-labour duties may apply. Duty data is loaded but pending expert review.",
  sourceLabel: "FR",
  sourceUrl: "https://www.federalregister.gov/",
  indicativePct: 10,
  hint: "could add 10%",
  counted: true,
};

// A stored duty_estimates row, as LINKED_ESTIMATE_COLUMNS plus the export's
// columns read it.
export const storedEstimate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "e-project",
  created_at: "2026-10-23T09:00:00Z",
  as_of_date: "2026-10-23",
  entry_date: "2026-10-23",
  total_usd: "7891.71",
  warnings: [PENDING_WARNING],
  duty_reviews: [{ programKey: "section_301_forced_labor", name: "Section 301 (forced labour)", status: "pending_review", reviewedAt: null }],
  forwarder_quote_id: null,
  input_snapshot: null,
  label: "ZZQA linked est",
  hts_code: "6109100012",
  origin_country: "CN",
  customs_value_usd: "39999.99",
  base_duty_usd: "6599.99",
  additional_duties_usd: "1000.00",
  fees_usd: "291.72",
  ...over,
});

// The quote's own estimate: complete, one program reviewed.
export const quoteEstimate = (over: Record<string, unknown> = {}) =>
  storedEstimate({
    id: "e-quote",
    forwarder_quote_id: "q",
    label: "Acme quote check",
    hts_code: "6402993110",
    origin_country: "VN",
    customs_value_usd: "10000.00",
    base_duty_usd: "600.00",
    additional_duties_usd: "1250.00",
    fees_usd: "47.14",
    total_usd: "1897.14",
    entry_date: "2026-11-08",
    warnings: [],
    duty_reviews: [{ programKey: "section_301_forced_labor", name: "Section 301 (forced labour)", status: "reviewed", reviewedAt: "2026-10-02T09:00:00Z" }],
    ...over,
  });
