import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ORIGIN_COUNTRY_CODES } from "./countries";
import {
  excludedCount,
  excludedPrograms,
  INCOMPLETE_ESTIMATE_LABEL,
  incompleteNote,
  isIncompleteEstimate,
  matchesProgramTrigger,
  totalLabel,
  type DutyProgramRow,
  type ProgramWarning,
} from "./programs";

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

describe("matchesProgramTrigger", () => {
  const forcedLabour = PROGRAMS[0];
  const metals = PROGRAMS[2];
  test("origin and HTS triggers (NULL = any)", () => {
    expect(matchesProgramTrigger(forcedLabour, "VN", "6402993110")).toBe(true);
    expect(matchesProgramTrigger(forcedLabour, "KE", "6402993110")).toBe(false);
    expect(matchesProgramTrigger(metals, "KE", "7208101500")).toBe(true);
    // A prefix must match from the start of the code.
    expect(matchesProgramTrigger(metals, "KE", "0872000000")).toBe(false);
  });
});

describe("the excluded-programs summary and label", () => {
  const warning = (overrides: Partial<ProgramWarning>): ProgramWarning => ({
    programKey: "k",
    name: "K",
    text: "",
    sourceLabel: "",
    sourceUrl: "",
    ...overrides,
  });

  test("uses each warning's hint; exempt-pending notes don't count", () => {
    const excluded = excludedPrograms(
      [
        warning({ programKey: "a", name: "A", hint: "could add 10% (about $1,000.00, 9903.05.44); pending expert review" }),
        warning({ programKey: "b", name: "B", hint: null }),
        warning({ programKey: "c", name: "C", hint: "appears exempt", counted: false }),
      ],
      10000,
    );
    expect(excluded).toEqual([
      { programKey: "a", name: "A", hint: "could add 10% (about $1,000.00, 9903.05.44); pending expert review" },
      { programKey: "b", name: "B", hint: null },
    ]);
  });

  test("warnings saved by PR 1 (indicativePct only) still read the same", () => {
    expect(excludedPrograms([warning({ indicativePct: 12.5 })], 10000)[0].hint).toBe(
      "could add up to 12.5% (about $1,250.00)",
    );
    expect(excludedPrograms([warning({ indicativePct: 12.5 })], 10001.25)[0].hint).toBe(
      "could add up to 12.5% (about $1,250.16)",
    );
    expect(excludedPrograms([warning({})], 10000)[0].hint).toBeNull();
  });

  test("excludedCount reads a saved warnings snapshot", () => {
    expect(excludedCount([warning({}), warning({ counted: false })])).toBe(1);
    expect(excludedCount(null)).toBe(0);
  });

  test("excludedPrograms and excludedCount use the same rule", () => {
    const snapshots: ProgramWarning[][] = [
      [],
      [warning({ counted: false })],
      [warning({ programKey: "a" }), warning({ programKey: "b", counted: true }), warning({ programKey: "c", counted: false })],
    ];
    for (const warnings of snapshots) {
      expect(excludedPrograms(warnings, 10000)).toHaveLength(excludedCount(warnings));
    }
  });

  test("an estimate is incomplete when its total leaves out a program", () => {
    expect(isIncompleteEstimate([])).toBe(false);
    expect(isIncompleteEstimate(null)).toBe(false);
    expect(isIncompleteEstimate("not a list")).toBe(false);
    expect(isIncompleteEstimate([warning({})])).toBe(true);
    expect(isIncompleteEstimate([warning({ programKey: "a" }), warning({ programKey: "b" }), warning({ programKey: "c" })])).toBe(true);
    // Notes and exempt-pending programs aren't left out of the total.
    expect(isIncompleteEstimate([warning({ counted: false }), warning({ programKey: "b", counted: false })])).toBe(false);
    expect(isIncompleteEstimate([warning({ counted: false }), warning({ programKey: "b", counted: true })])).toBe(true);
    // Warnings saved before PR 2a have no counted flag: they count, as in "Excludes N".
    const legacy = { programKey: "a", name: "A", text: "May apply.", sourceLabel: "S", sourceUrl: "https://example.gov/" };
    expect(isIncompleteEstimate([legacy])).toBe(true);
  });

  test("the incomplete note says how many programs aren't included", () => {
    expect(INCOMPLETE_ESTIMATE_LABEL).toBe("Incomplete estimate");
    expect(incompleteNote(1)).toBe("Not final: 1 additional duty program is not included.");
    expect(incompleteNote(3)).toBe("Not final: 3 additional duty programs are not included.");
  });

  test("the total's label says what it excludes", () => {
    expect(totalLabel(0)).toBe("Estimated duties and fees (USD)");
    expect(totalLabel(1)).toBe("Base duty + fees (USD) — EXCLUDES 1 additional duty program that may apply");
    expect(totalLabel(3, true)).toBe("Duties + fees (USD) — EXCLUDES 3 additional duty programs that may apply");
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
