import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { inputsFromCells } from "./cell-map";
import { blankInputs, parseInputs } from "./input-schema";
import { runAudit } from "./engine";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", "golden", `${name}.json`), "utf8")) as { inputs: Record<string, number | string> };

describe("the stored inputs", () => {
  test("a blank audit is valid and 'Not started'", () => {
    const parsed = parseInputs(blankInputs());
    expect(parsed.ok).toBe(true);
    expect(runAudit(blankInputs()).figures.status).toBe("Not started");
  });

  test.each(["Test_Airspeed_FCL", "Test_Navilink_LCL", "Test_Synthetic_Errors"])("the real case %s is valid as saved, and unchanged by saving", (name) => {
    const inputs = inputsFromCells(fixture(name).inputs);
    const parsed = parseInputs(inputs);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.inputs).toEqual(inputs);
  });

  test("an unknown field is refused", () => {
    const inputs = { ...blankInputs(), shipment: { ...blankInputs().shipment, extra: "x" } };
    expect(parseInputs(inputs).ok).toBe(false);
  });
});
