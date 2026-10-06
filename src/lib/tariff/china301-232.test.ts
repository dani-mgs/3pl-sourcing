import { describe, expect, test } from "vitest";
import { evaluateAdditionalDuties, inForceOn, type DutyRow, type ProgramReview, type ReviewStatus } from "./additional-duties";
import { calculateEstimate, type FeeRow } from "./calculate";
import type { DutyProgramRow } from "./programs";
import { centsToNumber, parseDecimal, toCents } from "./rational";
import { seedRows } from "./__fixtures__/seed-rows";

// Golden cases for China Section 301 and Section 232 metals, run on the
// SEEDED rows (data/tariff/2a-origin-301 and 2b-china301-232, exactly what
// the seed migrations insert), worked by hand from U.S. notes 16, 20, 31, 50
// and 52 and the 2026 HTS Revision 20 rates. $10,000 by sea: MPF 0.3464% =
// $34.64, HMF 0.125% = $12.50, fees $47.14.

const FEES: FeeRow[] = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];
const RELEASE = { name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28" };

const program = (key: string, name: string, overrides: Partial<DutyProgramRow>): DutyProgramRow => ({
  key,
  name,
  status: "not_loaded",
  warning_text: `${name} may apply.`,
  trigger_origins: null,
  trigger_hts_prefixes: null,
  indicative_rates: null,
  source_label: "Source",
  source_url: "https://www.cbp.gov/",
  sort_order: 0,
  ...overrides,
});

// As seeded in duty_programs (sort order after the PR 2b migration).
const PROGRAMS: DutyProgramRow[] = [
  program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"], sort_order: 5 }),
  program("section_301_forced_labor", "Section 301 (forced labour)", { trigger_origins: ["CN", "IN", "VN", "BR", "GB", "DE"], sort_order: 10 }),
  program("section_301_brazil", "Section 301 (Brazil)", { trigger_origins: ["BR"], sort_order: 30 }),
  program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
  program("section_232_vehicles", "Section 232 (vehicles and parts)", { trigger_hts_prefixes: ["87"], sort_order: 60 }),
  program("section_232_timber", "Section 232 (timber, lumber and derivatives)", { trigger_hts_prefixes: ["44", "9401", "9403"], sort_order: 70 }),
];

const ALL_ROWS: DutyRow[] = [...seedRows("data/tariff/2a-origin-301"), ...seedRows("data/tariff/2b-china301-232")];
const REVIEWED = ["section_301_china", "section_301_forced_labor", "section_301_brazil", "section_232_metals"];

const review = (programKey: string, status: ReviewStatus): ProgramReview => ({
  programKey,
  status,
  reviewedAt: status === "reviewed" ? "2026-10-03T09:00:00Z" : null,
  reviewedByName: status === "reviewed" ? "Dani" : null,
  chapter99ChangesSinceReview: 0,
});

function estimate(
  htsCode: string,
  generalRate: string,
  origin: string,
  options: { asOf?: string; pending?: string[] } = {},
) {
  const asOf = options.asOf ?? "2026-10-03";
  const value = parseDecimal("10000");
  const base = calculateEstimate({
    line: { hts_code: htsCode, general_rate: generalRate, special_rate: null, other_rate: "35%" },
    release: RELEASE,
    originIsColumn2: false,
    shipmentMode: "Sea",
    customsValueUsd: value,
    quantity: null,
    fees: FEES,
  });
  if (!base.ok) throw new Error(base.reason);
  const additional = evaluateAdditionalDuties({
    programs: PROGRAMS,
    rows: ALL_ROWS.filter((r) => inForceOn(r, asOf)),
    reviews: REVIEWED.map((key) => review(key, options.pending?.includes(key) ? "pending_review" : "reviewed")),
    originCountry: origin,
    htsCode,
    customsValueUsd: value,
    baseDutyUsd: parseDecimal(base.baseDutyUsd),
    asOfDate: asOf,
  });
  // save_duty_estimate() re-checks that the additional-duty lines add up to
  // additional_duties_usd; keep that true for every golden case.
  expect(additional.lines.reduce((sum, l) => sum + Math.round(l.amountUsd * 100), 0)).toBe(
    Math.round(additional.additionalDutiesUsd * 100),
  );
  const total = centsToNumber(
    toCents(parseDecimal(base.baseDutyUsd)) + toCents(parseDecimal(additional.additionalDutiesUsd)) + toCents(parseDecimal(base.feesUsd)),
  );
  const line = (code: string) => additional.lines.find((l) => l.code === code);
  const warning = (key: string) => additional.warnings.find((w) => w.programKey === key);
  return { base, additional, total, line, warning };
}

describe("China Section 301", () => {
  test("9403.60.8040 (dining tables, Free): List 3 +25%; forced labour named, as Section 232 timber may apply", () => {
    const r = estimate("9403608040", "Free", "CN");
    expect(r.line("section_301_china")).toMatchObject({ heading: "9903.88.03", rateText: "+25%", amountUsd: 2500 });
    // Note 52(f): forced-labour 301 doesn't apply to Section 232 goods, and
    // 232 timber (not loaded) may cover wooden furniture of 9403.
    expect(r.warning("section_301_forced_labor")).toMatchObject({ kind: "depends_on", counted: true });
    expect(r.warning("section_301_forced_labor")!.hint).toContain("exempt if Section 232 (timber, lumber and derivatives) applies (9903.05.90)");
    expect(r.additional.additionalDutiesUsd).toBe(2500);
    expect(r.total).toBe(2547.14);
  });

  test("4202.92.31 (17.6%): base + List 3 25% + forced labour 12.5% stack (notes 20(e) and 52(a))", () => {
    const r = estimate("4202923100", "17.6%", "CN");
    expect(r.line("section_301_china")).toMatchObject({ heading: "9903.88.03", amountUsd: 2500 });
    expect(r.line("section_301_forced_labor")).toMatchObject({ heading: "9903.05.31", amountUsd: 1250 });
    expect(r.additional.lines.map((l) => l.code)).toEqual(["section_301_china", "section_301_forced_labor"]);
    expect(r.total).toBe(1760 + 2500 + 1250 + 47.14);
  });

  test("steel of China 7208.10.15: Section 232 50% + note 31(b) 25%; forced labour exempt (note 52(f))", () => {
    const r = estimate("7208101500", "Free", "CN");
    expect(r.line("section_301_china")).toMatchObject({ heading: "9903.91.01", amountUsd: 2500 });
    expect(r.line("section_232_metals")).toMatchObject({ heading: "9903.82.02", amountUsd: 5000 });
    expect(r.line("section_301_forced_labor")).toMatchObject({ rateText: "Exempt", heading: "9903.05.90" });
    expect(r.total).toBe(7547.14);
  });

  test("a code with a USTR exclusion: duty applied, exclusion named with its end date, never applied", () => {
    const r = estimate("8504409580", "Free", "CN");
    const china = r.line("section_301_china")!;
    expect(china).toMatchObject({ heading: "9903.88.03", amountUsd: 2500 });
    expect(china.notes!.some((n) => n.startsWith("9903.88.69 (USTR product exclusion, through Nov 9, 2026): may be exempt if the article is:") && n.endsWith("Verify before relying on it"))).toBe(true);
    expect(r.total).toBe(2500 + 1250 + 47.14);
  });

  test("the exclusion caveat disappears once the exclusion has lapsed", () => {
    const r = estimate("8504409580", "Free", "CN", { asOf: "2026-11-10" });
    expect(r.line("section_301_china")!.notes!.some((n) => n.includes("9903.88.69"))).toBe(false);
    expect(r.line("section_301_china")!.amountUsd).toBe(2500);
  });

  test("8517.62.00 at 8 digits is in two lists, each except the other's numbers: the higher applies, the other is named", () => {
    const r = estimate("85176200", "Free", "CN");
    const china = r.line("section_301_china")!;
    expect(china).toMatchObject({ heading: "9903.88.04", amountUsd: 2500 });
    expect(china.notes).toEqual(
      expect.arrayContaining([
        "Also listed under 9903.88.15 (+7.5%); which applies depends on the 10-digit statistical number, so the higher is shown",
        "9903.88.04 doesn't apply to statistical number 8517.62.0090",
      ]),
    );
  });

  test("at 10 digits the excepted number goes to List 4A only", () => {
    const r = estimate("8517620090", "Free", "CN");
    expect(r.line("section_301_china")).toMatchObject({ heading: "9903.88.15", rateText: "+7.5%", amountUsd: 750 });
  });

  test("pending review: China 301 is named, not counted", () => {
    const r = estimate("4202923100", "17.6%", "CN", { pending: ["section_301_china"] });
    expect(r.line("section_301_china")).toBeUndefined();
    expect(r.warning("section_301_china")).toMatchObject({ kind: "pending_review", counted: true });
    expect(r.warning("section_301_china")!.hint).toBe("could add 25% (about $2,500.00, 9903.88.03); pending expert review");
    expect(r.total).toBe(1760 + 1250 + 47.14);
  });
});

describe("Section 232 metals", () => {
  test("Brazil steel 7208.10.15: 50% on the full value; Brazil and forced-labour 301 exempt", () => {
    const r = estimate("7208101500", "Free", "BR");
    expect(r.line("section_232_metals")).toMatchObject({ heading: "9903.82.02", rateText: "+50%", amountUsd: 5000, detail: "50% of $10,000.00" });
    expect(r.line("section_301_brazil")).toMatchObject({ rateText: "Exempt", heading: "9903.05.07" });
    expect(r.line("section_301_forced_labor")).toMatchObject({ rateText: "Exempt", heading: "9903.05.90" });
    expect(r.total).toBe(5047.14);
  });

  test("UK steel: the higher 50% applies; 25% (9903.82.04) is named as the 95% UK-melt alternative", () => {
    const r = estimate("7208101500", "Free", "GB");
    const metals = r.line("section_232_metals")!;
    expect(metals).toMatchObject({ heading: "9903.82.02", amountUsd: 5000 });
    expect(metals.notes).toContain(
      "9903.82.04: could be +25% instead (about $2,500.00) if at least 95% of the aluminium was smelted or most recently cast, or at least 95% of the steel was melted and poured, in the United Kingdom (U.S. note 16(d))",
    );
    expect(r.line("section_301_forced_labor")).toMatchObject({ rateText: "Exempt" });
    expect(r.total).toBe(5047.14);
  });

  test("a derivative at a minimum total: 8479.89.9599 (2.5%) is topped up to 15% (9903.82.10)", () => {
    const r = estimate("8479899599", "2.5%", "IN");
    const metals = r.line("section_232_metals")!;
    expect(metals).toMatchObject({ heading: "9903.82.10", rateText: "Minimum total 15%", amountUsd: 1250 });
    expect(metals.detail).toBe("Minimum total 15%: $1,500.00 less base duty $250.00 (base rate 2.5%)");
    expect(metals.notes).toContain(
      "9903.82.07: could be a minimum total of 10% instead (about $750.00) if at least 85% of the article's aluminium, steel or copper content was smelted and cast (melted and poured) in the United States (U.S. note 16(e))",
    );
    expect(r.total).toBe(250 + 1250 + 47.14);
  });

  test("metal under 15% of the weight: 232 applies with the caveat; forced labour says what it would add instead", () => {
    const r = estimate("8302416015", "3.9%", "VN");
    const metals = r.line("section_232_metals")!;
    expect(metals).toMatchObject({ heading: "9903.82.09", amountUsd: 2500 });
    expect(metals.notes).toContain(
      "9903.82.03: may be exempt if the aluminium, steel or copper listed for this provision is less than 15% of the article's weight (U.S. note 16(c); not for chapters 72, 73, 74 or 76)",
    );
    const fl = r.line("section_301_forced_labor")!;
    expect(fl).toMatchObject({ rateText: "Exempt", amountUsd: 0 });
    expect(fl.notes).toEqual([
      "If Section 232 (steel, aluminium, copper) doesn't apply (see its notes), this program adds 12.5% (about $1,250.00, 9903.05.84) instead",
    ]);
    expect(r.total).toBe(390 + 2500 + 47.14);
  });

  test("9903.82.22 countries (here the UK) on list (xi): unconfirmed, named, not counted", () => {
    const r = estimate("8427104000", "Free", "GB");
    expect(r.line("section_232_metals")).toBeUndefined();
    expect(r.warning("section_232_metals")).toMatchObject({ kind: "unconfirmed", counted: true });
    expect(r.warning("section_301_forced_labor")).toMatchObject({ kind: "depends_on" });
  });

  test("a Russian line on two lists: the higher (200%) applies and the other is named", () => {
    const r = estimate("8708103000", "2.5%", "RU");
    const metals = r.line("section_232_metals")!;
    expect(metals).toMatchObject({ heading: "9903.85.68", amountUsd: 20000 });
    expect(metals.notes).toContain("Also matches 9903.82.16 (+25%); only one applies — the higher is shown pending expert confirmation");
  });

  test("pending review: 232 named with what it would add; programs it excludes wait on it", () => {
    const r = estimate("7208101500", "Free", "BR", { pending: ["section_232_metals"] });
    expect(r.line("section_232_metals")).toBeUndefined();
    expect(r.warning("section_232_metals")!.hint).toBe("could add 50% (about $5,000.00, 9903.82.02); pending expert review");
    expect(r.warning("section_301_brazil")).toMatchObject({ kind: "depends_on", counted: true });
    expect(r.total).toBe(47.14);
  });
});
