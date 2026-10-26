import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isErr, type Cell } from "./calc-semantics";
import { inputsFromCells, type CellValues } from "./cell-map";
import { runAudit } from "./engine";
import { workbookCells } from "./__fixtures__/workbook-cells";

// Every formula cell of the v1.0 workbook (Audit, Summary and the hidden
// Checks sheet), recalculated by LibreOffice for each case
// (scripts/forwarder-audit/golden.py), against the engine. Numbers must be
// identical doubles; text identical; errors the same error.

const DIR = path.join(__dirname, "__fixtures__", "golden");
const FORMULA_CELLS: string[] = JSON.parse(readFileSync(path.join(DIR, "formula-cells.json"), "utf8"));
const CASES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "formula-cells.json")
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Fixture);

type Expected = number | string | { error: string };
type Fixture = { case: string; description: string; inputs: CellValues; outputs: Record<string, Expected> };

function same(expected: Expected, actual: Cell | undefined): boolean {
  if (actual === undefined) return false;
  if (typeof expected === "object") return isErr(actual) && actual.error === expected.error;
  return expected === actual;
}

describe("Forwarder Audit engine vs the v1.0 workbook (LibreOffice)", () => {
  it("has the real cases and the blank template", () => {
    const names = CASES.map((c) => c.case);
    for (const name of ["blank-template", "Test_Airspeed_FCL", "Test_Navilink_LCL", "Test_Synthetic_Errors"]) expect(names).toContain(name);
  });

  it.each(CASES.map((c) => [c.case, c] as const))("%s: every formula cell matches", (_name, fixture) => {
    const inputs = inputsFromCells(fixture.inputs);
    const cells = workbookCells(inputs, runAudit(inputs));
    const mismatches: string[] = [];
    for (const address of FORMULA_CELLS) {
      const expected = fixture.outputs[address] ?? "";
      const actual = cells.get(address);
      if (!same(expected, actual)) mismatches.push(`${address}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    expect(mismatches.slice(0, 25), `${mismatches.length} mismatching cells`).toEqual([]);
  });
});
