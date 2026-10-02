import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  parseDutyDetails,
  parseEndDate,
  parseMarkReviewed,
  parseNewDuty,
  parseNewFee,
  parseScopeLines,
} from "./parse-duty-data-forms";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const ID = "00000000-0000-4000-8000-0000000000d1";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("parseMarkReviewed / parseEndDate", () => {
  test("accepts a program key and optional note", () => {
    expect(parseMarkReviewed(form({ program_key: "section_301_brazil", note: "" }))).toEqual({
      ok: true,
      data: { programKey: "section_301_brazil", note: null },
    });
    expect(parseMarkReviewed(form({ program_key: "Robert'); drop", note: "" })).ok).toBe(false);
  });

  test("end date must be a real date and the id a uuid", () => {
    expect(parseEndDate(form({ id: ID, effective_to: "2026-12-31" }))).toEqual({ ok: true, data: { id: ID, effectiveTo: "2026-12-31" } });
    expect(parseEndDate(form({ id: ID, effective_to: "2026-02-30" })).ok).toBe(false);
    expect(parseEndDate(form({ id: "x", effective_to: "2026-12-31" })).ok).toBe(false);
  });
});

describe("parseDutyDetails", () => {
  const base = {
    id: ID,
    label: "Brazil",
    legal_status: "in_force_under_litigation",
    notes: "",
    source_label: "FR 2026-14542",
    source_url: "https://www.federalregister.gov/x",
    source_checked_on: "2026-10-02",
  };
  test("only non-rate fields", () => {
    expect(parseDutyDetails(form(base))).toMatchObject({ ok: true, data: { legalStatus: "in_force_under_litigation", notes: null } });
  });
  test("refuses a non-https source and an unknown legal status", () => {
    expect(parseDutyDetails(form({ ...base, source_url: "http://x" }))).toEqual({
      ok: false,
      error: "The source link must start with https://.",
    });
    expect(parseDutyDetails(form({ ...base, legal_status: "struck_down" })).ok).toBe(false);
  });
});

describe("parseScopeLines", () => {
  test("codes with optional article descriptions", () => {
    expect(parseScopeLines("0805.90.01 | Etrogs\n0201.10.05\n\n 1207.30.00 | Castor oil seeds, for sowing ")).toEqual({
      ok: true,
      data: [
        { prefix: "08059001", description: "Etrogs" },
        { prefix: "02011005", description: null },
        { prefix: "12073000", description: "Castor oil seeds, for sowing" },
      ],
    });
  });
  test("names the bad line", () => {
    expect(parseScopeLines("0805.90.01\n12AB")).toEqual({ ok: false, error: 'Scope line 2: "12AB" isn\'t a 4- to 10-digit HTS code.' });
  });
});

describe("parseNewDuty", () => {
  const base = {
    program_key: "section_301_forced_labor",
    authority: "section_301",
    chapter99_heading: "9903.05.84",
    chapter99_heading_at_minimum: "",
    label: "Vietnam",
    rate_type: "add",
    rate_pct: "12.5",
    origin_countries: "vn",
    condition_text: "",
    excludes_programs: "section_232_metals, section_232_vehicles",
    exclusion_heading: "9903.05.90",
    effective_from: "2027-01-01",
    effective_to: "",
    legal_status: "in_force",
    source_label: "HTS heading 9903.05.84",
    source_url: "https://www.federalregister.gov/x",
    source_checked_on: "2026-10-02",
    notes: "",
    scope: "",
  };

  test("an add row", () => {
    expect(parseNewDuty(form(base))).toMatchObject({
      ok: true,
      data: {
        rateType: "add",
        ratePct: 12.5,
        originCountries: ["VN"],
        excludesPrograms: ["section_232_metals", "section_232_vehicles"],
        exclusionHeading: "9903.05.90",
        effectiveTo: null,
        scope: [],
      },
    });
  });

  test("an exemption with a scope and no origin", () => {
    const result = parseNewDuty(
      form({ ...base, chapter99_heading: "9903.05.87", rate_type: "exempt", rate_pct: "", origin_countries: "", excludes_programs: "", exclusion_heading: "", scope: "0805.90.01 | Etrogs" }),
    );
    expect(result).toMatchObject({ ok: true, data: { originCountries: null, ratePct: null, scope: [{ prefix: "08059001" }] } });
  });

  test.each([
    [{ rate_type: "exempt" }, "An exemption has no rate; leave the rate empty."],
    [{ rate_pct: "" }, "Enter the rate."],
    [{ rate_type: "minimum_total" }, "A minimum-total row needs the heading used when the base rate already meets it."],
    [{ condition_text: "if USMCA" }, "Only exemptions can have a condition."],
    [{ origin_countries: "" }, "A duty needs at least one origin."],
    [{ origin_countries: "Vietnam" }, "Origins must be ISO country codes, e.g. VN, IN."],
    [{ exclusion_heading: "" }, "Give both the excluding programs and the heading claimed when excluded, or neither."],
    [{ effective_to: "2026-12-31" }, "The last day can't be before the first."],
    [{ chapter99_heading: "9903.5.84" }, "The heading must look like 9903.05.84."],
  ])("refuses %j", (overrides, message) => {
    expect(parseNewDuty(form({ ...base, ...overrides }))).toEqual({ ok: false, error: message });
  });
});

describe("parseNewFee", () => {
  const base = {
    fee_code: "mpf_formal",
    label: "MPF FY2028",
    rate_pct: "0.3464",
    min_usd: "35.50",
    max_usd: "690",
    flat_usd: "",
    applies_up_to_value_usd: "",
    effective_from: "2027-10-01",
    source_label: "FR",
    source_url: "https://www.federalregister.gov/x",
    notes: "",
  };
  test("a formal MPF row", () => {
    expect(parseNewFee(form(base))).toMatchObject({ ok: true, data: { ratePct: 0.3464, minUsd: 35.5, maxUsd: 690, flatUsd: null } });
  });
  test("each fee needs its own fields", () => {
    expect(parseNewFee(form({ ...base, max_usd: "" }))).toEqual({ ok: false, error: "Formal MPF needs the rate, minimum and maximum." });
    expect(parseNewFee(form({ ...base, max_usd: "10" }))).toEqual({ ok: false, error: "The maximum can't be below the minimum." });
    expect(parseNewFee(form({ ...base, fee_code: "mpf_informal" }))).toEqual({
      ok: false,
      error: "Informal MPF needs the flat fee and the value it applies up to.",
    });
  });
});
