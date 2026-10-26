import { describe, expect, it } from "vitest";
import { cat, eq, generalText, matchIndex, matchesCriterion, ref, round, sub, sum, trim } from "./calc-semantics";

describe("Calc semantics", () => {
  it("ROUND rounds half away from zero on the decimal value", () => {
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-2.675, 2)).toBe(-2.68);
    expect(round(0.125 * 3, 2)).toBe(0.38);
    expect(round(0, 2)).toBe(0);
  });

  it("snaps a near-cancelling subtraction to 0, and sums with compensation", () => {
    expect(sub(0.30000000000000004, 0.3)).toBe(0);
    expect(sub(100.01, 100)).toBeCloseTo(0.01, 12);
    expect(sum(Array(10).fill(0.1))).toBe(1);
  });

  it("compares like Calc: case-insensitive text, empty is 0 or \"\", numbers never equal text", () => {
    expect(eq("usd", "USD")).toBe(true);
    expect(eq(null, 0)).toBe(true);
    expect(eq(null, "")).toBe(true);
    expect(eq(0, "")).toBe(false);
    expect(eq(1, "1")).toBe(false);
  });

  it("TRIM collapses only plain spaces", () => {
    expect(trim("  Docs   fee ")).toBe("Docs fee");
    expect(trim("\tDocs")).toBe("\tDocs");
  });

  it("matches criteria with operators and wildcards, case-insensitively", () => {
    expect(matchesCriterion("Fumigation fee", "*fumig*")).toBe(true);
    expect(matchesCriterion("THC origin", "THC*")).toBe(true);
    expect(matchesCriterion("Fee1", "Fee?")).toBe(true);
    expect(matchesCriterion("Fee?", "Fee~?")).toBe(true);
    expect(matchesCriterion("Fee1", "Fee~?")).toBe(false);
    expect(matchesCriterion("Error - differs by 1.00 USD", "Error*")).toBe(true);
    expect(matchesCriterion("", "?*")).toBe(false);
    expect(matchesCriterion(0, 0)).toBe(true);
    expect(matchesCriterion({ error: "#VALUE!" }, "Error*")).toBe(false);
  });

  it("MATCH finds list items case-insensitively and reports 0 when missing", () => {
    expect(matchIndex("fob", ["EXW", "FOB"])).toBe(2);
    expect(matchIndex(null, ["EXW"])).toBe(0);
    expect(matchIndex("XYZ", ["EXW"])).toBe(0);
  });

  it("joins numbers with up to 15 significant digits and blanks as \"\"; a direct reference to a blank is 0", () => {
    expect(generalText(0.1 + 0.2)).toBe("0.3");
    expect(generalText(733)).toBe("733");
    expect(cat(null)).toBe("");
    expect(ref(null)).toBe(0);
  });
});
