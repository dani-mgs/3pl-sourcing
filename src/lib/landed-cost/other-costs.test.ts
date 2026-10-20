import { describe, expect, test } from "vitest";
import { MAX_OTHER_COST_LINES, OTHER_COST_LABEL_MAX, allocateOtherCosts, parseOtherCosts } from "./other-costs";

describe("parseOtherCosts", () => {
  test("trims labels, reads amounts exactly and totals them", () => {
    const result = parseOtherCosts([
      { label: "  Inland trucking ", amountUsd: "1,250.50" },
      { label: "Broker fee", amountUsd: "95" },
      { label: "Waived", amountUsd: "0" },
    ]);
    expect(result).toEqual({
      ok: true,
      lines: [
        { label: "Inland trucking", amountCents: BigInt(125050) },
        { label: "Broker fee", amountCents: BigInt(9500) },
        { label: "Waived", amountCents: BigInt(0) },
      ],
      totalCents: BigInt(134550),
    });
  });

  test("no lines is fine", () => {
    expect(parseOtherCosts([])).toEqual({ ok: true, lines: [], totalCents: BigInt(0) });
  });

  test(`at most ${MAX_OTHER_COST_LINES} lines`, () => {
    const line = { label: "Fee", amountUsd: "1" };
    expect(parseOtherCosts(Array(MAX_OTHER_COST_LINES).fill(line)).ok).toBe(true);
    expect(parseOtherCosts(Array(MAX_OTHER_COST_LINES + 1).fill(line)).ok).toBe(false);
  });

  test(`labels of 1 to ${OTHER_COST_LABEL_MAX} characters, after trimming`, () => {
    expect(parseOtherCosts([{ label: "x".repeat(OTHER_COST_LABEL_MAX), amountUsd: "1" }]).ok).toBe(true);
    expect(parseOtherCosts([{ label: "x".repeat(OTHER_COST_LABEL_MAX + 1), amountUsd: "1" }]).ok).toBe(false);
    expect(parseOtherCosts([{ label: "   ", amountUsd: "1" }]).ok).toBe(false);
  });

  test.each(["-5", "1.005", "abc", "", "1e3"])("rejects the amount %j", (amountUsd) => {
    const result = parseOtherCosts([{ label: "Fee", amountUsd }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Fee");
  });
});

describe("allocateOtherCosts", () => {
  test("splits by entered value, adding up exactly", () => {
    const result = allocateOtherCosts(BigInt(10000), [BigInt(60000), BigInt(30000), BigInt(10000)]);
    expect(result).toEqual({ ok: true, parts: [BigInt(6000), BigInt(3000), BigInt(1000)] });
  });
});
