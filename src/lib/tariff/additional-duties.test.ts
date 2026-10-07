import { describe, expect, test } from "vitest";
import {
  evaluateAdditionalDuties,
  staleReason,
  type DutyRow,
  type ProgramReview,
  type ReviewStatus,
} from "./additional-duties";
import { calculateEstimate, type FeeRow } from "./calculate";
import type { DutyProgramRow } from "./programs";
import { centsToNumber, parseDecimal, toCents } from "./rational";

// Golden cases for additional duties, worked by hand from U.S. notes 50 and
// 52 (FR 2026-14542, FR 2026-15181) and the 2026 HTS Revision 20 rates.
// Fees: FY2027 MPF 0.3464% (min $34.58, max $670.86), HMF 0.125%.

const FEES: FeeRow[] = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];
const RELEASE = { name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28" };
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const SECTION_232 = ["section_232_metals", "section_232_vehicles", "section_232_timber", "section_232_semiconductors", "section_232_pharmaceuticals"];

const program = (key: string, name: string, overrides: Partial<DutyProgramRow> = {}): DutyProgramRow => ({
  key,
  name,
  status: "not_loaded",
  warning_text: `${name} may apply.`,
  trigger_origins: null,
  trigger_hts_prefixes: null,
  indicative_rates: null,
  source_label: "Source",
  source_url: "https://www.federalregister.gov/",
  sort_order: 0,
  ...overrides,
});

const PROGRAMS: DutyProgramRow[] = [
  program("section_301_forced_labor", "Section 301 (forced labour)", {
    trigger_origins: ["IN", "VN", "CN", "BR", "CA", "JP", ...EU],
    indicative_rates: { IN: 10, VN: 12.5, CN: 12.5, BR: 12.5, CA: 10 },
    sort_order: 10,
  }),
  program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"], sort_order: 20 }),
  program("section_301_brazil", "Section 301 (Brazil)", { trigger_origins: ["BR"], indicative_rates: { BR: 25 }, sort_order: 30 }),
  program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
  program("section_232_vehicles", "Section 232 (vehicles and parts)", { trigger_hts_prefixes: ["87"], sort_order: 60 }),
];

let seq = 0;
const row = (overrides: Partial<DutyRow>): DutyRow => ({
  id: `row-${++seq}`,
  program_key: "section_301_forced_labor",
  chapter99_heading: "9903.05.44",
  chapter99_heading_at_minimum: null,
  label: "India",
  rate_type: "add",
  rate_pct: 10,
  origin_countries: ["IN"],
  hts_scope: "all",
  condition_text: null,
  excludes_programs: SECTION_232,
  exclusion_heading: "9903.05.90",
  filing_order: 10,
  effective_from: "2026-07-24",
  effective_to: null,
  legal_status: "in_force",
  source_label: "HTS heading and U.S. note 52, FR 2026-15181",
  source_url: "https://www.federalregister.gov/documents/2026/07/28/2026-15181/x",
  source_checked_on: "2026-10-02",
  scope: [],
  ...overrides,
});

// The forced-labour rows these cases need, as seeded.
const FL_ROWS: DutyRow[] = [
  row({}),
  row({ chapter99_heading: "9903.05.84", label: "Vietnam", rate_pct: 12.5, origin_countries: ["VN"] }),
  row({ chapter99_heading: "9903.05.31", label: "China", rate_pct: 12.5, origin_countries: ["CN"] }),
  row({ chapter99_heading: "9903.05.27", label: "Brazil", rate_pct: 12.5, origin_countries: ["BR"] }),
  row({ chapter99_heading: "9903.05.29", label: "Canada", rate_pct: 10, origin_countries: ["CA"] }),
  row({ chapter99_heading: "9903.05.39", chapter99_heading_at_minimum: "9903.05.38", label: "EU member states", rate_type: "minimum_total", rate_pct: 10, origin_countries: EU }),
  row({ chapter99_heading: "9903.05.49", chapter99_heading_at_minimum: "9903.05.48", label: "Japan", rate_type: "minimum_total", rate_pct: 12.5, origin_countries: ["JP"] }),
  row({ chapter99_heading: "9903.05.93", label: "USMCA goods of Canada", rate_type: "exempt", rate_pct: null, origin_countries: ["CA"], excludes_programs: [], exclusion_heading: null, condition_text: "the goods are entered free of duty under the USMCA (U.S. note 52(g))" }),
  row({ chapter99_heading: "9903.05.87", label: "Particular articles (any covered origin)", rate_type: "exempt", rate_pct: null, origin_countries: null, excludes_programs: [], exclusion_heading: null, hts_scope: "listed", scope: [{ hts_prefix: "08059001", article_description: "Etrogs" }] }),
];
const BR_ROWS: DutyRow[] = [
  row({ program_key: "section_301_brazil", chapter99_heading: "9903.05.01", label: "Brazil", rate_pct: 25, origin_countries: ["BR"], exclusion_heading: "9903.05.07" }),
  row({ program_key: "section_301_brazil", chapter99_heading: "9903.05.03", label: "Listed subheadings", rate_type: "exempt", rate_pct: null, origin_countries: ["BR"], excludes_programs: [], exclusion_heading: null, hts_scope: "listed", scope: [{ hts_prefix: "09011100", article_description: null }] }),
];

const review = (programKey: string, status: ReviewStatus, overrides: Partial<ProgramReview> = {}): ProgramReview => ({
  programKey,
  status,
  reviewedAt: status === "reviewed" ? "2026-10-02T09:00:00Z" : null,
  reviewedByName: status === "reviewed" ? "Dani" : null,
  chapter99ChangesSinceReview: 0,
  ...overrides,
});

const LINES = {
  footwear: { hts_code: "6402993110", general_rate: "6%", special_rate: null, other_rate: "35%" },
  higherRate: { hts_code: "6402993110", general_rate: "12%", special_rate: null, other_rate: "35%" },
  oranges: { hts_code: "0805100020", general_rate: "1.9¢/kg", special_rate: null, other_rate: "2.2¢/kg" },
  etrogs: { hts_code: "0805900100", general_rate: "2.2%", special_rate: null, other_rate: "35%" },
  coffee: { hts_code: "0901110015", general_rate: "Free", special_rate: null, other_rate: "Free" },
  steel: { hts_code: "7208101500", general_rate: "Free", special_rate: null, other_rate: "0.4¢/kg + 20%" },
};

function estimate(
  line: (typeof LINES)[keyof typeof LINES],
  origin: string,
  options: { rows?: DutyRow[]; reviews?: ProgramReview[]; mode?: "Sea" | "Air"; value?: string; quantity?: string; programs?: DutyProgramRow[] } = {},
) {
  const value = parseDecimal(options.value ?? "10000");
  const base = calculateEstimate({
    line,
    release: RELEASE,
    originIsColumn2: false,
    shipmentMode: options.mode ?? "Sea",
    customsValueUsd: value,
    quantity: options.quantity ? parseDecimal(options.quantity) : null,
    fees: FEES,
  });
  if (!base.ok) throw new Error(base.reason);
  const additional = evaluateAdditionalDuties({
    programs: options.programs ?? PROGRAMS,
    rows: options.rows ?? [...FL_ROWS, ...BR_ROWS],
    reviews: options.reviews ?? [review("section_301_forced_labor", "reviewed"), review("section_301_brazil", "reviewed")],
    originCountry: origin,
    htsCode: line.hts_code,
    customsValueUsd: value,
    baseDutyUsd: parseDecimal(base.baseDutyUsd),
    asOfDate: "2026-10-02",
  });
  const total = centsToNumber(
    toCents(parseDecimal(base.baseDutyUsd)) + toCents(parseDecimal(additional.additionalDutiesUsd)) + toCents(parseDecimal(base.feesUsd)),
  );
  return { base, additional, total };
}

const lineFor = (result: ReturnType<typeof estimate>, code: string) =>
  result.additional.lines.find((l) => l.code === code);
const warningFor = (result: ReturnType<typeof estimate>, key: string) =>
  result.additional.warnings.find((w) => w.programKey === key);

describe("golden: reviewed forced-labour Section 301", () => {
  test("India footwear 6402.99.31.10, $10,000, ocean → $1,647.14", () => {
    // 6% = 600.00; +10% (9903.05.44) = 1,000.00; MPF 34.64; HMF 12.50.
    const r = estimate(LINES.footwear, "IN");
    expect(r.additional.additionalDutiesUsd).toBe(1000);
    expect(r.total).toBe(1647.14);
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({
      kind: "additional",
      heading: "9903.05.44",
      rateText: "+10%",
      amountUsd: 1000,
      legalStatus: "In force",
      effectiveFrom: "2026-07-24",
      sourceCheckedOn: "2026-10-02",
    });
    expect(r.additional.warnings).toEqual([]);
  });

  test("Italy footwear (minimum total 10%) → $1,047.14", () => {
    // Column 1 is 6% < 10%, so column 1 + additional = 10% (9903.05.39):
    // 10% × 10,000 − 600 = 400.00; total 600 + 400 + 47.14.
    const r = estimate(LINES.footwear, "IT");
    expect(r.additional.additionalDutiesUsd).toBe(400);
    expect(r.total).toBe(1047.14);
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({ heading: "9903.05.39", rateText: "Minimum total 10%", amountUsd: 400 });
  });

  test("a base rate already at the minimum adds nothing and reports the other heading", () => {
    // 12% ≥ 10%: 9903.05.38, nothing added.
    const r = estimate(LINES.higherRate, "DE");
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({ heading: "9903.05.38", amountUsd: 0 });
    expect(r.additional.additionalDutiesUsd).toBe(0);
  });

  test("a specific rate uses its ad valorem equivalent for the minimum (note 52(k))", () => {
    // Japan oranges: 20,000 kg × 1.9¢ = 380.00, i.e. 3.8% of $10,000;
    // minimum 12.5% = 1,250.00, so 870.00 is added.
    const r = estimate(LINES.oranges, "JP", { quantity: "20000" });
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({ heading: "9903.05.49", amountUsd: 870 });
  });

  test("an origin outside the action gets nothing and no warning", () => {
    const r = estimate(LINES.footwear, "KE");
    expect(r.additional.lines).toEqual([]);
    expect(r.additional.warnings).toEqual([]);
    expect(r.total).toBe(647.14);
  });
});

describe("Section 232 exclusion (note 52(f))", () => {
  test("China steel: forced labour is named as 'exempt if Section 232 applies', no percentage, nothing added", () => {
    const r = estimate(LINES.steel, "CN", { mode: "Air" });
    expect(r.additional.additionalDutiesUsd).toBe(0);
    expect(lineFor(r, "section_301_forced_labor")).toBeUndefined();
    const fl = warningFor(r, "section_301_forced_labor")!;
    expect(fl).toMatchObject({ kind: "depends_on", counted: true, indicativePct: null });
    expect(fl.hint).toBe("exempt if Section 232 (steel, aluminium, copper) applies (9903.05.90)");
    expect(fl.hint).not.toMatch(/%/);
    // China 301 and 232 metals are still not loaded, and say so.
    expect(r.additional.warnings.map((w) => [w.programKey, w.kind])).toEqual([
      ["section_301_forced_labor", "depends_on"],
      ["section_301_china", "not_loaded"],
      ["section_232_metals", "not_loaded"],
    ]);
  });

  test("once Section 232 is reviewed and applies, forced labour is exempt under 9903.05.90", () => {
    const metals = row({
      program_key: "section_232_metals",
      chapter99_heading: "9903.82.02",
      label: "Steel, aluminium and copper articles",
      rate_pct: 50,
      origin_countries: null,
      excludes_programs: [],
      exclusion_heading: null,
      hts_scope: "listed",
      scope: [{ hts_prefix: "7208", article_description: null }],
    });
    const r = estimate(LINES.steel, "CN", {
      mode: "Air",
      rows: [...FL_ROWS, metals],
      reviews: [review("section_301_forced_labor", "reviewed"), review("section_232_metals", "reviewed")],
    });
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({ amountUsd: 0, heading: "9903.05.90", rateText: "Exempt" });
    expect(lineFor(r, "section_232_metals")).toMatchObject({ amountUsd: 5000, heading: "9903.82.02" });
    expect(r.additional.additionalDutiesUsd).toBe(5000);
    expect(warningFor(r, "section_301_forced_labor")).toBeUndefined();
  });
});

describe("pending vs reviewed", () => {
  test("pending rows never count; the warning says pending expert review, with the amount from the rows", () => {
    const r = estimate(LINES.footwear, "IN", { reviews: [review("section_301_forced_labor", "pending_review")] });
    expect(r.additional.additionalDutiesUsd).toBe(0);
    expect(r.total).toBe(647.14);
    const fl = warningFor(r, "section_301_forced_labor")!;
    expect(fl).toMatchObject({ kind: "pending_review", counted: true, indicativePct: 10 });
    expect(fl.hint).toBe("could add 10% (about $1,000.00, 9903.05.44); pending expert review");
    expect(r.additional.dutyReviews).toEqual([
      expect.objectContaining({ programKey: "section_301_forced_labor", status: "pending_review", reviewedAt: null }),
    ]);
  });

  test("a pending minimum-total program gives the top-up amount", () => {
    const r = estimate(LINES.footwear, "IT", { reviews: [] });
    expect(warningFor(r, "section_301_forced_labor")!.hint).toBe(
      "could add 4% (about $400.00, 9903.05.39); pending expert review",
    );
  });

  test("pending China steel still doesn't over-warn: named, no percentage", () => {
    const r = estimate(LINES.steel, "CN", { reviews: [] });
    expect(warningFor(r, "section_301_forced_labor")).toMatchObject({ kind: "depends_on", indicativePct: null });
  });

  test("a program with no rows uses its indicative HTS rate, labelled as such", () => {
    const r = estimate(LINES.footwear, "VN", { rows: [] });
    const fl = warningFor(r, "section_301_forced_labor")!;
    expect(fl.kind).toBe("not_loaded");
    expect(fl.hint).toBe(
      "could add up to 12.5% (about $1,250.00) — indicative rate from the HTS, not expert-reviewed",
    );
  });

  test("every reviewed program on the estimate says who reviewed it and when", () => {
    const r = estimate(LINES.footwear, "IN");
    expect(r.additional.dutyReviews).toEqual([
      {
        programKey: "section_301_forced_labor",
        name: "Section 301 (forced labour)",
        status: "reviewed",
        reviewedAt: "2026-10-02T09:00:00Z",
        reviewedByName: "Dani",
        staleReason: null,
      },
    ]);
  });
});

describe("stacking and exemptions", () => {
  test("Brazil: Section 301 (Brazil) 25% and forced labour 12.5% stack (notes 50(a)(i), 52(a))", () => {
    const r = estimate(LINES.footwear, "BR");
    expect(lineFor(r, "section_301_forced_labor")!.amountUsd).toBe(1250);
    expect(lineFor(r, "section_301_brazil")!.amountUsd).toBe(2500);
    expect(r.total).toBe(600 + 1250 + 2500 + 47.14);
  });

  test("a listed Brazil subheading is exempt from Section 301 (Brazil) (9903.05.03), not from forced labour", () => {
    const r = estimate(LINES.coffee, "BR");
    expect(lineFor(r, "section_301_brazil")).toMatchObject({ amountUsd: 0, heading: "9903.05.03", rateText: "Exempt" });
    expect(lineFor(r, "section_301_forced_labor")!.amountUsd).toBe(1250);
  });

  test("a conditional exemption (USMCA) is noted, not applied", () => {
    const r = estimate(LINES.footwear, "CA");
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({
      amountUsd: 1000,
      notes: ["9903.05.93: may be exempt if the goods are entered free of duty under the USMCA (U.S. note 52(g))"],
    });
  });

  test("a particular article within a subheading is noted, not applied", () => {
    const r = estimate(LINES.etrogs, "VN");
    expect(lineFor(r, "section_301_forced_labor")).toMatchObject({
      amountUsd: 1250,
      notes: ["9903.05.87: may be exempt if the article is: Etrogs"],
    });
  });
});

describe("staleness", () => {
  test("a review older than 30 days, or chapter 99 changes since, is flagged", () => {
    expect(staleReason(review("x", "reviewed", { reviewedAt: "2026-09-01T00:00:00Z" }), "2026-10-02")).toBe(
      "last reviewed 31 days ago",
    );
    expect(staleReason(review("x", "reviewed", { reviewedAt: "2026-09-02T00:00:00Z" }), "2026-10-02")).toBeNull();
    expect(staleReason(review("x", "reviewed", { chapter99ChangesSinceReview: 2 }), "2026-10-02")).toBe(
      "2 Chapter 99 headings changed in the HTS since",
    );
    expect(staleReason(review("x", "pending_review"), "2026-10-02")).toBeNull();
  });

  test("the estimate carries the stale reason", () => {
    const r = estimate(LINES.footwear, "IN", {
      reviews: [review("section_301_forced_labor", "reviewed", { reviewedAt: "2026-08-01T00:00:00Z", chapter99ChangesSinceReview: 1 })],
    });
    expect(r.additional.dutyReviews[0].staleReason).toBe(
      "last reviewed 62 days ago; 1 Chapter 99 heading changed in the HTS since",
    );
    // Still applied: staleness warns, it doesn't remove reviewed duties.
    expect(r.additional.additionalDutiesUsd).toBe(1000);
  });
});

describe("one row per program: precedence, conditions, unconfirmed and excepted numbers", () => {
  // A Section 232-like program on steel, with the shapes PR 2b seeds.
  const m = (overrides: Partial<DutyRow>) =>
    row({
      program_key: "section_232_metals",
      excludes_programs: [],
      exclusion_heading: null,
      origin_countries: null,
      hts_scope: "listed",
      scope: [{ hts_prefix: "7208", article_description: null }],
      ...overrides,
    });
  const ANY = m({ chapter99_heading: "9903.82.02", label: "Steel", rate_pct: 50 });
  const metalsReviewed = [review("section_232_metals", "reviewed"), review("section_301_brazil", "reviewed"), review("section_301_forced_labor", "reviewed")];
  const run = (rows: DutyRow[], origin: string, line: (typeof LINES)[keyof typeof LINES] = LINES.steel) =>
    estimate(line, origin, { rows: [...rows, ...FL_ROWS, ...BR_ROWS], reviews: metalsReviewed });

  test("a row for named origins beats an any-origin row", () => {
    const r = run([ANY, m({ chapter99_heading: "9903.82.14", label: "Russia", rate_pct: 60, origin_countries: ["RU"] })], "RU");
    expect(lineFor(r, "section_232_metals")).toMatchObject({ heading: "9903.82.14", amountUsd: 6000 });
  });

  test("a lowering condition isn't assumed: the higher rate applies and the lower one is named", () => {
    const uk = m({ chapter99_heading: "9903.82.04", label: "UK", rate_pct: 25, origin_countries: ["GB"], condition_text: "95% melted and poured in the UK" });
    const r = run([ANY, uk], "GB");
    expect(lineFor(r, "section_232_metals")).toMatchObject({
      heading: "9903.82.02",
      amountUsd: 5000,
      notes: ["9903.82.04: could be +25% instead (about $2,500.00) if 95% melted and poured in the UK"],
    });
  });

  test("an assumed condition applies, and says what applies otherwise", () => {
    const uk = m({ chapter99_heading: "9903.82.04", label: "UK", rate_pct: 25, origin_countries: ["GB"], condition_text: "95% melted and poured in the UK", assume_condition: true });
    const r = run([ANY, uk], "GB");
    expect(lineFor(r, "section_232_metals")).toMatchObject({
      heading: "9903.82.04",
      amountUsd: 2500,
      notes: ["Assumes 95% melted and poured in the UK; if not, 9903.82.02 (+50%) applies instead"],
    });
  });

  test("equal rows: the higher charge applies and the other is named", () => {
    const r = run([ANY, m({ chapter99_heading: "9903.82.09", label: "Derivatives", rate_pct: 25 })], "BR");
    expect(lineFor(r, "section_232_metals")).toMatchObject({
      heading: "9903.82.02",
      amountUsd: 5000,
      notes: ["Also matches 9903.82.09 (+25%); only one applies — the higher is shown pending expert confirmation"],
    });
  });

  test("the longest matching line wins, and an excepted number takes the code out", () => {
    const tenDigit = m({ chapter99_heading: "9903.82.10", label: "Ten-digit", rate_pct: 15, scope: [{ hts_prefix: "7208101500", article_description: null }] });
    expect(lineFor(run([ANY, tenDigit], "BR"), "section_232_metals")).toMatchObject({ heading: "9903.82.10" });
    const except = m({ chapter99_heading: "9903.82.02", label: "Steel", rate_pct: 50, scope: [{ hts_prefix: "7208", article_description: null }, { hts_prefix: "7208101500", article_description: null, excluded: true }] });
    const r = run([except], "BR");
    expect(lineFor(r, "section_232_metals")).toBeUndefined();
    // Section 232 doesn't apply, so Brazil's 301 does.
    expect(lineFor(r, "section_301_brazil")).toMatchObject({ amountUsd: 2500 });
  });

  test("an unconfirmed row more specific than a confirmed one never displaces it: the confirmed charge stays, the other is named", () => {
    const unconfirmed = m({ chapter99_heading: "9903.82.22", label: "Listed countries", rate_type: "unconfirmed", rate_pct: 15, origin_countries: ["BR"], condition_text: "total or added?" });
    const r = run([ANY, unconfirmed], "BR");
    expect(lineFor(r, "section_232_metals")).toMatchObject({
      heading: "9903.82.02",
      amountUsd: 5000,
      notes: ["Could be +15% (9903.82.22) instead, not yet confirmed: total or added?"],
    });
    expect(warningFor(r, "section_232_metals")).toBeUndefined();
    // The confirmed 232 charge settles the program it excludes.
    expect(lineFor(r, "section_301_brazil")).toMatchObject({ rateText: "Exempt" });
  });

  test("a less specific unconfirmed row is named as not included", () => {
    const broad = m({ chapter99_heading: "9903.82.22", label: "Broad", rate_type: "unconfirmed", rate_pct: 15, scope: [{ hts_prefix: "72", article_description: null }], condition_text: "total or added?" });
    const tenDigit = m({ chapter99_heading: "9903.82.10", label: "Ten-digit", rate_pct: 15, scope: [{ hts_prefix: "7208101500", article_description: null }] });
    const r = run([broad, tenDigit], "BR");
    expect(lineFor(r, "section_232_metals")).toMatchObject({
      heading: "9903.82.10",
      notes: ["9903.82.22 (rate unconfirmed, not included): total or added?"],
    });
  });

  test("when only unconfirmed rows apply, nothing is charged: the program is named as may apply and settles nothing it would exclude", () => {
    const unconfirmed = m({ chapter99_heading: "9903.82.22", label: "Listed countries", rate_type: "unconfirmed", rate_pct: 15, origin_countries: ["BR"], condition_text: "total or added?" });
    const r = run([unconfirmed], "BR");
    expect(lineFor(r, "section_232_metals")).toBeUndefined();
    expect(warningFor(r, "section_232_metals")).toMatchObject({ kind: "unconfirmed", counted: true });
    expect(warningFor(r, "section_232_metals")!.hint).toBe("may apply under 9903.82.22; rate unconfirmed, for expert review");
    expect(warningFor(r, "section_301_brazil")).toMatchObject({ kind: "depends_on" });
  });

  test("a conditional exemption on the excluding program: the excluded one says what it would add", () => {
    const under15 = m({ chapter99_heading: "9903.82.03", label: "Under 15%", rate_type: "exempt", rate_pct: null, condition_text: "the metal is under 15% of the weight" });
    const r = run([ANY, under15], "BR");
    expect(lineFor(r, "section_232_metals")!.notes).toEqual(["9903.82.03: may be exempt if the metal is under 15% of the weight"]);
    expect(lineFor(r, "section_301_brazil")).toMatchObject({
      rateText: "Exempt",
      notes: ["If Section 232 (steel, aluminium, copper) doesn't apply (see its notes), this program adds 25% (about $2,500.00, 9903.05.01) instead"],
    });
  });

  test("only a row with an unmet condition matches: a note, not counted", () => {
    const russianAluminium = m({ chapter99_heading: "9903.85.67", label: "Russian-smelted", rate_pct: 200, condition_text: "Russian-smelted aluminium was used" });
    const r = run([russianAluminium], "BR");
    expect(lineFor(r, "section_232_metals")).toBeUndefined();
    expect(warningFor(r, "section_232_metals")).toMatchObject({ kind: "conditional", counted: false });
    expect(lineFor(r, "section_301_brazil")).toMatchObject({ amountUsd: 2500 });
  });

  test("a product exclusion with an end date is named with it", () => {
    const exclusion = row({ program_key: "section_301_brazil", chapter99_heading: "9903.05.09", label: "USTR product exclusion", rate_type: "exempt", rate_pct: null, origin_countries: ["BR"], excludes_programs: [], exclusion_heading: null, hts_scope: "listed", effective_to: "2026-11-09", scope: [{ hts_prefix: "6402993110", article_description: "Sandals of a particular kind" }] });
    const r = estimate(LINES.footwear, "BR", { rows: [...BR_ROWS, exclusion], reviews: metalsReviewed });
    expect(lineFor(r, "section_301_brazil")!.notes).toEqual([
      "9903.05.09 (USTR product exclusion, through Nov 9, 2026): may be exempt if the article is: Sandals of a particular kind. Verify before relying on it",
    ]);
  });
});
