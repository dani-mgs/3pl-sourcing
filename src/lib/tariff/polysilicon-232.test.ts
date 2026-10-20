import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateAdditionalDuties, inForceOn, type DutyRow, type ProgramReview } from "./additional-duties";
import { excludedCount, programStarted, type DutyProgramRow } from "./programs";
import { parseDecimal } from "./rational";
import { seedRows } from "./__fixtures__/seed-rows";

// Section 232 polysilicon (Proclamation 11052): not loaded, named only for
// entry on or after 2026-12-04, on the SEEDED China 301 and forced-labour
// rows. The program row is read from its migration, so the text tested is the
// text shipped. Dates are UTC calendar strings: the same in every time zone.

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261020141702_tariff_polysilicon_232_warning.sql"),
  "utf8",
);
const seeded = /\('section_232_polysilicon', '([^']+)',\s*'([^']+)',\s*null, array\[([^\]]+)\], date '(\d{4}-\d{2}-\d{2})',/.exec(MIGRATION);
if (!seeded) throw new Error("polysilicon program row not found in its migration");

const program = (key: string, name: string, overrides: Partial<DutyProgramRow>): DutyProgramRow => ({
  key,
  name,
  status: "not_loaded",
  warning_text: `${name} may apply.`,
  trigger_origins: null,
  trigger_hts_prefixes: null,
  trigger_from: null,
  indicative_rates: null,
  source_label: "Source",
  source_url: "https://www.cbp.gov/",
  sort_order: 0,
  ...overrides,
});

const POLYSILICON = program("section_232_polysilicon", seeded[1], {
  warning_text: seeded[2],
  trigger_hts_prefixes: seeded[3].split(",").map((p) => p.trim().replace(/'/g, "")),
  trigger_from: seeded[4],
  sort_order: 105,
});

const PROGRAMS: DutyProgramRow[] = [
  program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"], sort_order: 5 }),
  program("section_301_forced_labor", "Section 301 (forced labour)", { trigger_origins: ["CN", "DE"], sort_order: 10 }),
  program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
  program("section_232_semiconductors", "Section 232 (semiconductors)", { trigger_hts_prefixes: ["8541", "8542"], sort_order: 80 }),
  POLYSILICON,
];

const ALL_ROWS: DutyRow[] = [...seedRows("data/tariff/2a-origin-301"), ...seedRows("data/tariff/2b-china301-232")];
const reviewed = (programKey: string): ProgramReview => ({
  programKey,
  status: "reviewed",
  reviewedAt: "2026-10-19T09:00:00Z",
  reviewedByName: "Dani",
  chapter99ChangesSinceReview: 0,
});

function estimate(htsCode: string, origin: string, entryDate: string) {
  const additional = evaluateAdditionalDuties({
    programs: PROGRAMS,
    rows: ALL_ROWS.filter((r) => inForceOn(r, entryDate)),
    reviews: ["section_301_china", "section_301_forced_labor", "section_232_metals"].map(reviewed),
    originCountry: origin,
    htsCode,
    customsValueUsd: parseDecimal("10000"),
    baseDutyUsd: parseDecimal("0"),
    asOfDate: "2026-10-20",
    entryDate,
  });
  return {
    ...additional,
    line: (code: string) => additional.lines.find((l) => l.code === code),
    warning: (key: string) => additional.warnings.find((w) => w.programKey === key),
  };
}

const DAY_BEFORE = "2026-12-03";
const START = "2026-12-04";
const DAY_AFTER = "2026-12-05";

// One Annex I line under each prefix.
const COVERED = {
  "2804.61.0000 polysilicon": "2804610000",
  "3818.00.0020 wafers": "3818000020",
  "8541.42.0010 solar cells": "8541420010",
  "8541.43.0010 solar modules": "8541430010",
};

describe("the seeded polysilicon program", () => {
  test("starts on 4 December 2026 with the four Annex I prefixes, any origin", () => {
    expect(POLYSILICON.trigger_from).toBe(START);
    expect(POLYSILICON.trigger_hts_prefixes).toEqual(["280461", "3818", "854142", "854143"]);
    expect(POLYSILICON.trigger_origins).toBeNull();
  });

  test("the warning names minimum import prices and the country of origin, with no numbers", () => {
    expect(POLYSILICON.warning_text).toContain("minimum import prices");
    expect(POLYSILICON.warning_text).toContain("country of origin");
    expect(POLYSILICON.warning_text).not.toMatch(/\d+(\.\d+)?\s*%|\$\d/);
  });

  test("programStarted: NULL is any date; otherwise from that day on", () => {
    expect(programStarted({ trigger_from: null }, "2000-01-01")).toBe(true);
    expect(programStarted(POLYSILICON, DAY_BEFORE)).toBe(false);
    expect(programStarted(POLYSILICON, START)).toBe(true);
    expect(programStarted(POLYSILICON, DAY_AFTER)).toBe(true);
  });
});

describe("the polysilicon warning by entry date", () => {
  for (const [label, code] of Object.entries(COVERED)) {
    test(`${label}: none the day before, named from 4 December`, () => {
      expect(estimate(code, "CN", DAY_BEFORE).warning("section_232_polysilicon")).toBeUndefined();
      for (const day of [START, DAY_AFTER]) {
        expect(estimate(code, "CN", day).warning("section_232_polysilicon")).toEqual({
          programKey: "section_232_polysilicon",
          name: "Section 232 (polysilicon and derivatives)",
          text: POLYSILICON.warning_text,
          sourceLabel: "Source",
          sourceUrl: "https://www.cbp.gov/",
          kind: "not_loaded",
          indicativePct: null,
          hint: null,
          counted: true,
        });
      }
    });
  }

  test("any origin, not only China", () => {
    expect(estimate("2804610000", "DE", START).warning("section_232_polysilicon")).toMatchObject({ kind: "not_loaded" });
    expect(estimate("2804610000", "US", DAY_BEFORE).warning("section_232_polysilicon")).toBeUndefined();
  });

  test("8541.49 and 8541.90 aren't covered (Annex I), on any date", () => {
    for (const code of ["8541497000", "8541900000"]) {
      for (const day of [DAY_BEFORE, START, DAY_AFTER]) {
        const r = estimate(code, "CN", day);
        expect(r.warning("section_232_polysilicon")).toBeUndefined();
        // The broad semiconductors trigger still names its own program.
        expect(r.warning("section_232_semiconductors")).toMatchObject({ kind: "not_loaded" });
      }
    }
  });
});

describe("how it stacks with forced labour and China Section 301", () => {
  test("2804.61 of China: forced labour is still charged; polysilicon never makes it depend", () => {
    for (const day of [DAY_BEFORE, START, DAY_AFTER]) {
      const r = estimate("2804610000", "CN", day);
      expect(r.line("section_301_forced_labor")).toMatchObject({ heading: "9903.05.31", amountUsd: 1250 });
      expect(r.warning("section_301_forced_labor")).toBeUndefined();
      // Four-year review 50% (9903.91.05) is unchanged.
      expect(r.line("section_301_china")).toMatchObject({ heading: "9903.91.05", amountUsd: 5000 });
    }
  });

  test("8541.43 of China: 301 solar 50% unchanged; forced labour depends on semiconductors only; one more program named from 4 December", () => {
    const before = estimate("8541430010", "CN", DAY_BEFORE);
    const after = estimate("8541430010", "CN", START);
    for (const r of [before, after]) {
      expect(r.line("section_301_china")).toMatchObject({ heading: "9903.91.02", rateText: "+50%", amountUsd: 5000 });
      expect(r.warning("section_301_forced_labor")).toMatchObject({ kind: "depends_on" });
      expect(r.warning("section_301_forced_labor")!.hint).toBe("exempt if Section 232 (semiconductors) applies (9903.05.90)");
    }
    expect(after.additionalDutiesUsd).toBe(before.additionalDutiesUsd);
    expect(excludedCount(after.warnings)).toBe(excludedCount(before.warnings) + 1);
  });
});
