import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseCsv, toCsv } from "./lib/csv.mjs";
import { REPO_ROOT } from "./lib/sources.mjs";
import { seedDirs, seedOutputs } from "./generate-seeds.mjs";

// Drift test: every seed migration must be exactly what its committed data
// files generate. Edit data/tariff/<seed>/ (or re-extract from the sources),
// then run `npm run tariff:seed`; never hand-edit a seed migration.

describe("tariff seed migrations", () => {
  const dirs = seedDirs();

  test("there is a seed for PR 2a and PR 2b", () => {
    expect(dirs).toEqual(expect.arrayContaining(["data/tariff/2a-origin-301", "data/tariff/2b-china301-232"]));
  });

  const outputs = dirs.flatMap((dir) => seedOutputs(dir).map((o) => [o.migration, dir, o.sql]));

  test("the 2b seed has its source-links migration", () => {
    expect(outputs.map(([migration]) => migration)).toContain(
      "supabase/migrations/20261005111624_tariff_seed_source_links.sql",
    );
  });

  test.each(outputs)("%s matches %s", (migration, _dir, sql) => {
    const committed = readFileSync(path.join(REPO_ROOT, migration), "utf8");
    expect(sql === committed).toBe(true);
  });
});

describe("csv", () => {
  test("round-trips commas, quotes and newlines", () => {
    const rows = [{ a: "8413.91.9039", b: 'Pump casings, "bodies"\nand covers' }, { a: "", b: "plain" }];
    expect(parseCsv(toCsv(["a", "b"], rows))).toEqual(rows);
  });
});
