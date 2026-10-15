import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { dutyEstimateLabelText } from "@/lib/forwarder/report-data";
import { buildInputSnapshot, type LinkProject } from "@/lib/tariff/forwarder-link";
import { summarizeLinkedEstimates } from "@/lib/tariff/linked-estimates";
import { excludedCount, excludedPrograms, isIncompleteEstimate } from "@/lib/tariff/programs";
import { rowToSavedEstimate } from "@/lib/tariff/saved-estimate";
import { DutyEstimatesList } from "../forwarder-sourcing/[id]/duty-estimates";
import { EstimateResultView } from "./estimate-result";
import { SavedEstimatesTable } from "./saved-estimates-table";

// A saved estimate whose ONLY warning is "the fiscal year's MPF fees aren't
// entered" (no programKey, no name), read back from the database row and
// shown everywhere estimates appear: no crash, no program named, the
// Incomplete badge and the fee reason, and no "EXCLUDES".

const FEES_WARNING = {
  kind: "fees_not_entered",
  text: "Not final: MPF fees for FY2028 (from Oct 1, 2027) aren't entered yet; FY2027's are used.",
  fiscalYear: 2028,
  startsOn: "2027-10-01",
  counted: false,
};

const ROW = {
  id: "00000000-0000-4000-8000-00000000f001",
  created_at: "2026-10-16T09:00:00+00:00",
  created_by: "00000000-0000-4000-8000-0000000000d1",
  label: "PO 2028",
  as_of_date: "2026-10-16",
  entry_date: "2027-10-02",
  hts_code: "6402993110",
  hts_description: "Other",
  hts_ancestor_descriptions: [],
  hts_release_name: "2026HTSRev20",
  hts_release_title: "Revision 20 (2026)",
  hts_release_start_date: "2026-09-28",
  rate_column: "general",
  rate_text: "6%",
  special_rate_text: null,
  origin_country: "IT",
  shipment_mode: "Sea",
  customs_value_original: 10000,
  original_currency: "USD",
  exchange_rate_to_usd: 1,
  exchange_rate_source: null,
  exchange_rate_date: null,
  customs_value_usd: 10000,
  quantity: null,
  quantity_unit: null,
  base_duty_usd: 600,
  fees_usd: 47.14,
  total_usd: 647.14,
  lines: [
    { kind: "duty", code: "general", label: "Base duty (general rate)", rateText: "6%", amountUsd: 600, detail: null, sourceLabel: "HTSUS", sourceUrl: "https://hts.usitc.gov/", effectiveFrom: "2026-09-28" },
  ],
  warnings: [FEES_WARNING],
  additional_duties_usd: 0,
  duty_reviews: [],
  freight_insurance_deduction_usd: null,
  forwarder_project_id: null,
  forwarder_quote_id: null,
  input_snapshot: null,
};

const project: LinkProject = {
  id: "p1", updated_at: "2026-10-01T00:00:00Z", hs_code: "6402.99.31.10", origin_country: "Italy", invoice_value: 10000,
  invoice_currency: "USD", current_incoterm: "FOB", current_freight_cost_usd: 1000, shipment_mode: "Sea", weight_kg: 100, units: 10,
};

// Words that would mean a program (or a missing name) was shown.
const NO_PROGRAM = /undefined|null|EXCLUDES|Excludes|Not included:|Additional duties not included|Section 301|Section 232/;

describe("an estimate whose only warning is the fees one", () => {
  test("the shared rules: incomplete, but no program left out", () => {
    expect(isIncompleteEstimate([FEES_WARNING])).toBe(true);
    expect(excludedCount([FEES_WARNING])).toBe(0);
    expect(excludedPrograms([FEES_WARNING as never], 10000)).toEqual([]);
  });

  test("the saved estimate page: read back from the row, badge and reason, no program", () => {
    const saved = rowToSavedEstimate(ROW);
    expect(saved).not.toBeNull();
    const html = renderToStaticMarkup(<EstimateResultView estimate={saved!.estimate} />);
    expect(html).toContain("Incomplete estimate");
    expect(html).toContain("Not final: MPF fees for FY2028 (from Oct 1, 2027) aren&#x27;t entered yet; FY2027&#x27;s are used.");
    expect(html).toContain("Estimated duties and fees (USD)");
    // Everything but the fixed "What this estimate doesn't include" list, which always names Section 232.
    expect(html.slice(0, html.indexOf("What this estimate doesn&#x27;t include"))).not.toMatch(NO_PROGRAM);
  });

  test("the Saved estimates list", () => {
    const html = renderToStaticMarkup(<SavedEstimatesTable estimates={[ROW]} authors={new Map()} />);
    expect(html).toContain("Incomplete estimate");
    expect(html).toContain("FY2028 MPF fees not entered");
    expect(html).not.toMatch(NO_PROGRAM);
  });

  test("the forwarder card and the Expert CSV labels", () => {
    const [summary] = summarizeLinkedEstimates(
      [{ ...ROW, input_snapshot: buildInputSnapshot(project, null, { customs_value_basis: "invoice", deduction_offered: false, quantity_from: null }) }],
      project,
      new Map(),
    );
    expect(summary).toMatchObject({ excludedCount: 0, incomplete: true, feesNotEntered: "FY2028 MPF fees not entered" });
    const card = renderToStaticMarkup(<DutyEstimatesList rows={[{ summary, title: "Project" }]} projectId="p1" canWrite={false} emptyText="None" />);
    expect(card).toContain("Incomplete estimate");
    expect(card).toContain("FY2028 MPF fees not entered");
    expect(card).not.toMatch(NO_PROGRAM);
    const labels = dutyEstimateLabelText(summary);
    expect(labels.startsWith("Incomplete estimate; FY2028 MPF fees not entered; ")).toBe(true);
    expect(labels).not.toMatch(NO_PROGRAM);
  });
});
