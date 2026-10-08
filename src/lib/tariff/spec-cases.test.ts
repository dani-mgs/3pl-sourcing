import { describe, expect, test } from "vitest";
import { evaluateAdditionalDuties, type DutyRow, type ProgramReview } from "./additional-duties";
import { calculateEstimate, type FeeRow } from "./calculate";
import type { DutyProgramRow } from "./programs";
import { centsToNumber, parseDecimal, toCents } from "./rational";

// The handover spec's cases: $50,000 customs value from China by sea,
// entry 2026-10-04 unless stated. The MFN rates and every additional-duty
// rate are ILLUSTRATIVE inputs (synthetic rows, not the HTS or the database),
// so these test the arithmetic, the cent rounding and the MPF/HMF rules, not
// any real rate. Fees are the FY2027 values: MPF 0.3464% (min $34.58, max
// $670.86), HMF 0.125% on ocean shipments only.

const FEES: FeeRow[] = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];

const RELEASE = { name: "TEST", title: "Illustrative rates", release_start_date: "2026-01-01" };
const ENTRY = "2026-10-04";
const SECTION_232 = ["section_232_metals", "section_232_vehicles", "section_232_timber", "section_232_semiconductors", "section_232_pharmaceuticals"];

const program = (key: string, name: string, triggers: Partial<DutyProgramRow> = {}): DutyProgramRow => ({
  key, name, status: "not_loaded", warning_text: `${name} may apply.`, trigger_origins: null, trigger_hts_prefixes: null, ...triggers,
  indicative_rates: null, source_label: "Source", source_url: "https://www.federalregister.gov/", sort_order: 0,
});
const PROGRAMS = [
  program("section_301_forced_labor", "Section 301 (forced labour)", { trigger_origins: ["CN"] }),
  program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"] }),
  // The goods (8504.40) aren't steel, aluminium or copper articles, so with no
  // 232 row Section 232 adds 0%; case 3 gives it a 50% row.
  program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"] }),
];

let seq = 0;
const row = (overrides: Partial<DutyRow>): DutyRow => ({
  id: `spec-${++seq}`, program_key: "section_301_china", chapter99_heading: "9903.88.03", chapter99_heading_at_minimum: null,
  label: "Illustrative", rate_type: "add", rate_pct: 25, origin_countries: ["CN"], hts_scope: "all", condition_text: null,
  assume_condition: false, excludes_programs: [], exclusion_heading: null, filing_order: 10, effective_from: "2020-01-01",
  effective_to: null, legal_status: "in_force", source_label: "Illustrative", source_url: "https://example.gov/",
  source_checked_on: "2026-10-02", scope: [], ...overrides,
});

const china301 = (ratePct: number) => row({ chapter99_heading: ratePct === 25 ? "9903.88.03" : "9903.88.15", rate_pct: ratePct });
// Forced labour is exempt where Section 232 applies (U.S. note 52(f)).
const forcedLabour = (ratePct: number) =>
  row({ program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: ratePct, excludes_programs: SECTION_232, exclusion_heading: "9903.05.90" });
const section232 = (ratePct: number) =>
  row({ program_key: "section_232_metals", chapter99_heading: "9903.82.02", rate_pct: ratePct, origin_countries: null });

const reviewed = (programKey: string): ProgramReview => ({
  programKey, status: "reviewed", reviewedAt: "2026-10-02T09:00:00Z", reviewedByName: "Dani", chapter99ChangesSinceReview: 0,
});

function spec(options: { mfn: string; rows: DutyRow[]; value?: string; mode?: "Sea" | "Air" }) {
  const value = parseDecimal(options.value ?? "50000");
  const base = calculateEstimate({
    line: { hts_code: "8504409540", general_rate: options.mfn, special_rate: null, other_rate: "35%" },
    release: RELEASE, originIsColumn2: false, shipmentMode: options.mode ?? "Sea", customsValueUsd: value, quantity: null, fees: FEES,
  });
  if (!base.ok) throw new Error(base.reason);
  const additional = evaluateAdditionalDuties({
    programs: PROGRAMS, rows: options.rows,
    reviews: PROGRAMS.map((p) => reviewed(p.key)),
    originCountry: "CN", htsCode: "8504409540", customsValueUsd: value,
    baseDutyUsd: parseDecimal(base.baseDutyUsd), asOfDate: ENTRY,
  });
  const cents = (s: string | number) => toCents(parseDecimal(s));
  const duty = centsToNumber(cents(base.baseDutyUsd) + cents(additional.additionalDutiesUsd));
  const fee = (code: string) => base.lines.find((l) => l.code === code)?.amountUsd;
  const total = centsToNumber(cents(duty) + cents(base.feesUsd));
  return { duty, mpf: fee("mpf_formal"), hmf: fee("hmf"), total, additional };
}

describe("handover spec: $50,000 from China by sea, entry 2026-10-04", () => {
  test("1. 3% MFN, 301 25%, 232 0%, forced labour 12.5%: duty $20,250.00, MPF $173.20, HMF $62.50, total $20,485.70", () => {
    const r = spec({ mfn: "3%", rows: [china301(25), forcedLabour(12.5)] });
    expect(r).toMatchObject({ duty: 20250, mpf: 173.2, hmf: 62.5, total: 20485.7 });
  });

  test("2. 16.5% MFN, 301 7.5%, 232 0%, forced labour 12.5%: duty $18,250.00, MPF $173.20, HMF $62.50, total $18,485.70", () => {
    const r = spec({ mfn: "16.5%", rows: [china301(7.5), forcedLabour(12.5)] });
    expect(r).toMatchObject({ duty: 18250, mpf: 173.2, hmf: 62.5, total: 18485.7 });
  });

  test("3. 0% MFN, 301 25%, 232 50%, forced labour 0%: duty $37,500.00, MPF $173.20, HMF $62.50, total $37,735.70", () => {
    // Forced labour doesn't stack on Section 232 goods, so it adds nothing.
    const r = spec({ mfn: "0%", rows: [china301(25), section232(50), forcedLabour(12.5)] });
    expect(r).toMatchObject({ duty: 37500, mpf: 173.2, hmf: 62.5, total: 37735.7 });
    expect(r.additional.lines.find((l) => l.code === "section_301_forced_labor")).toMatchObject({ rateText: "Exempt", amountUsd: 0 });
  });

  test("4. case 1 at $5,000: duty $2,025.00, MPF $34.58 (the minimum), HMF $6.25, total $2,065.83", () => {
    // 0.3464% of $5,000 is $17.32, below the $34.58 minimum.
    const r = spec({ mfn: "3%", rows: [china301(25), forcedLabour(12.5)], value: "5000" });
    expect(r).toMatchObject({ duty: 2025, mpf: 34.58, hmf: 6.25, total: 2065.83 });
  });

  test.skip("5. case 1 at entry 2026-07-01 (Section 122 10% instead of forced labour): duty $19,000.00, total $19,235.70 — skipped: past entry dates are deliberately unsupported (the entry window is today-1 to today+366) and Section 122 history isn't loaded", () => {});

  test("Air: case 1 by air freight: no HMF, total $20,423.20", () => {
    const r = spec({ mfn: "3%", rows: [china301(25), forcedLabour(12.5)], mode: "Air" });
    expect(r).toMatchObject({ duty: 20250, mpf: 173.2, hmf: undefined, total: 20423.2 });
  });
});
