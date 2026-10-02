import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Cross-checks the PR 2a seed (additional_duties) against PR 1's indicative
// rates (duty_programs.indicative_rates). Both were taken from HTS headings
// 9903.05.20–.84 (Revision 20), separately; they must agree.

const migrations = path.join(process.cwd(), "supabase/migrations");
const seed = readFileSync(path.join(migrations, "20261002151203_tariff_seed_origin_duties.sql"), "utf8");
const programs = readFileSync(path.join(migrations, "20261002135139_tariff_fees_and_programs.sql"), "utf8");

// values ('section_301_forced_labor', 'section_301', '9903.05.84', null, 'Vietnam', 'add',\n 12.5, array['VN'], ...
const ROW =
  /values \('(section_301_[a-z_]+)', 'section_301', '(9903\.\d{2}\.\d{2})', (?:'[^']*'|null), '((?:[^']|'')*)', '(add|minimum_total|exempt)',\s*([\d.]+|null), (array\[[^\]]*\]|null)/g;

const rows = [...seed.matchAll(ROW)].map((m) => ({
  program: m[1],
  heading: m[2],
  label: m[3],
  rateType: m[4],
  rate: m[5] === "null" ? null : Number(m[5]),
  origins: m[6] === "null" ? null : [...m[6].matchAll(/'([A-Z]{2})'/g)].map((o) => o[1]),
}));

const indicative = JSON.parse(
  /set indicative_rates = '(\{[^']+\})',\s*indicative_rates_source = 'HTS headings 9903\.05\.20/.exec(programs)![1],
) as Record<string, number>;

describe("PR 2a seed", () => {
  test("has every row the plan lists", () => {
    const count = (program: string, rateType: string) =>
      rows.filter((r) => r.program === program && r.rateType === rateType).length;
    expect(count("section_301_forced_labor", "add")).toBe(55);
    expect(count("section_301_forced_labor", "minimum_total")).toBe(5);
    expect(count("section_301_forced_labor", "exempt")).toBe(14);
    expect(count("section_301_brazil", "add")).toBe(1);
    expect(count("section_301_brazil", "exempt")).toBe(4);
  });

  test("forced-labour flat rates agree with the indicative rates, origin by origin", () => {
    const flat = Object.fromEntries(
      rows
        .filter((r) => r.program === "section_301_forced_labor" && r.rateType === "add")
        .map((r) => [r.origins![0], r.rate]),
    );
    expect(flat).toEqual(indicative);
  });

  test("minimum-total origins are the EU, Japan, South Korea, Switzerland and Taiwan", () => {
    const minimum = rows.filter((r) => r.rateType === "minimum_total");
    expect(minimum.map((r) => [r.heading, r.rate])).toEqual([
      ["9903.05.39", 10],
      ["9903.05.49", 12.5],
      ["9903.05.71", 12.5],
      ["9903.05.74", 12.5],
      ["9903.05.76", 10],
    ]);
    expect(minimum[0].origins).toHaveLength(27);
  });

  test("Brazil is +25% (9903.05.01)", () => {
    expect(rows.find((r) => r.heading === "9903.05.01")).toMatchObject({ rateType: "add", rate: 25, origins: ["BR"] });
  });

  test("every seeded heading is unique", () => {
    expect(new Set(rows.map((r) => r.heading)).size).toBe(rows.length);
  });
});
