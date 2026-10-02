import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ORIGIN_COUNTRY_CODES } from "./countries";
import { excludedPrograms, matchProgramWarnings, totalLabel, type DutyProgramRow } from "./programs";

const program = (overrides: Partial<DutyProgramRow>): DutyProgramRow => ({
  key: "x",
  name: "X",
  status: "not_loaded",
  warning_text: "May apply.",
  trigger_origins: null,
  trigger_hts_prefixes: null,
  indicative_rates: null,
  source_label: "Source",
  source_url: "https://example.gov/",
  sort_order: 0,
  ...overrides,
});

const PROGRAMS: DutyProgramRow[] = [
  program({
    key: "section_301_forced_labor",
    trigger_origins: ["CN", "CA", "DE", "VN"],
    indicative_rates: { CN: 12.5, CA: 10, VN: 12.5 },
    sort_order: 10,
  }),
  program({ key: "section_301_china", trigger_origins: ["CN"], sort_order: 20 }),
  program({ key: "section_232_metals", trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
  program({ key: "section_232_vehicles", trigger_hts_prefixes: ["87"], sort_order: 60 }),
  program({ key: "section_338_canada", trigger_origins: ["CA"], sort_order: 110 }),
  program({ key: "expired", status: "inactive", trigger_origins: ["CN"], sort_order: 5 }),
];

const keys = (origin: string, code: string) => matchProgramWarnings(PROGRAMS, origin, code).map((w) => w.programKey);

describe("matchProgramWarnings", () => {
  test("China-origin steel warns for every program that may apply, in order", () => {
    expect(keys("CN", "7208101500")).toEqual(["section_301_forced_labor", "section_301_china", "section_232_metals"]);
  });

  test("Canada-origin vehicles", () => {
    expect(keys("CA", "8703230190")).toEqual(["section_301_forced_labor", "section_232_vehicles", "section_338_canada"]);
  });

  test("no warning when nothing matches; inactive programs never warn", () => {
    expect(keys("KE", "6402993110")).toEqual([]);
    expect(keys("CN", "6402993110")).not.toContain("expired");
  });

  test("a prefix must match from the start of the code", () => {
    expect(keys("KE", "0872000000")).toEqual([]);
  });
});

describe("indicative rates and the excluded-programs label", () => {
  test("a program carries its flat rate for the origin, or null to just name it", () => {
    const vn = matchProgramWarnings(PROGRAMS, "VN", "6402993110");
    expect(vn).toEqual([expect.objectContaining({ programKey: "section_301_forced_labor", indicativePct: 12.5 })]);
    // Germany is a minimum-total origin: named, no percentage.
    const de = matchProgramWarnings(PROGRAMS, "DE", "6402993110");
    expect(de[0].indicativePct).toBeNull();
    // China steel: forced labour has a flat 12.5%; China 301 and 232 vary by product.
    expect(matchProgramWarnings(PROGRAMS, "CN", "7208101500").map((w) => [w.programKey, w.indicativePct])).toEqual([
      ["section_301_forced_labor", 12.5],
      ["section_301_china", null],
      ["section_232_metals", null],
    ]);
  });

  test("Vietnam footwear, $10,000: forced labour could add up to 12.5% (about $1,250)", () => {
    const excluded = excludedPrograms(matchProgramWarnings(PROGRAMS, "VN", "6402993110"), 10000);
    expect(excluded).toEqual([
      { programKey: "section_301_forced_labor", name: "X", indicativePct: 12.5, indicativeUsd: 1250 },
    ]);
  });

  test("rough amounts round to the cent", () => {
    const [first] = excludedPrograms([{ programKey: "k", name: "K", text: "", sourceLabel: "", sourceUrl: "", indicativePct: 12.5 }], 10001.25);
    expect(first.indicativeUsd).toBe(1250.16);
  });

  test("warnings saved before indicative rates existed are just named", () => {
    const [first] = excludedPrograms([{ programKey: "k", name: "K", text: "", sourceLabel: "", sourceUrl: "" }], 10000);
    expect(first).toMatchObject({ indicativePct: null, indicativeUsd: null });
  });

  test("the total's label says what it excludes", () => {
    expect(totalLabel(0)).toBe("Estimated duties and fees (USD)");
    expect(totalLabel(1)).toBe("Base duty + fees (USD) — EXCLUDES 1 additional duty program that may apply");
    expect(totalLabel(3)).toBe("Base duty + fees (USD) — EXCLUDES 3 additional duty programs that may apply");
  });
});

describe("duty_programs seed", () => {
  // Every origin in the migration's trigger lists must be selectable in the
  // calculator, or its warning could never show.
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261002135139_tariff_fees_and_programs.sql"),
    "utf8",
  );
  const seed = migration.slice(migration.indexOf("insert into duty_programs"), migration.indexOf("-- Flat additional rates"));
  const codes = [...seed.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1]);
  const forcedLabourRates = JSON.parse(
    /set indicative_rates = '(\{[^']+\})',\s*indicative_rates_source = 'HTS headings 9903\.05\.20/.exec(migration)![1],
  ) as Record<string, number>;

  test("lists the 60 forced-labour economies (EU members expanded) and the single-origin programs", () => {
    expect(new Set(codes).size).toBeGreaterThanOrEqual(86);
    for (const code of ["CN", "BR", "NI", "CA", "RU", "BY", "CU", "KP", "TT", "DE", "TW"]) {
      expect(codes).toContain(code);
    }
  });

  test("forced-labour flat rates: 10% or 12.5%, only for trigger origins, never for minimum-total origins", () => {
    expect(Object.keys(forcedLabourRates)).toHaveLength(55);
    expect(new Set(Object.values(forcedLabourRates))).toEqual(new Set([10, 12.5]));
    for (const code of Object.keys(forcedLabourRates)) expect(codes).toContain(code);
    for (const code of ["DE", "FR", "JP", "KR", "CH", "TW"]) expect(forcedLabourRates[code]).toBeUndefined();
    expect(forcedLabourRates.VN).toBe(12.5);
    expect(forcedLabourRates.TT).toBe(10);
  });

  test("every trigger origin is a selectable country of origin", () => {
    expect(codes.filter((code) => !ORIGIN_COUNTRY_CODES.includes(code))).toEqual([]);
  });
});
