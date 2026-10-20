import { describe, expect, test } from "vitest";
import { fromInteger, parseDecimal } from "@/lib/tariff/rational";
import { ALL_WEIGHTS_ZERO, allocateCents } from "./allocation";

const weights = (...values: (number | string)[]) => values.map((v) => (typeof v === "number" ? fromInteger(v) : parseDecimal(v)));

function parts(total: number, ...w: (number | string)[]): number[] {
  const result = allocateCents(BigInt(total), weights(...w));
  if (!result.ok) throw new Error(result.error);
  return result.parts.map(Number);
}

describe("allocateCents", () => {
  test("splits exactly when the shares are whole cents", () => {
    expect(parts(1000, 1, 1, 2)).toEqual([250, 250, 500]);
  });

  test("the parts always add up to the amount", () => {
    for (const total of [1, 2, 99, 100, 101, 3458, 85400]) {
      const split = parts(total, 3, 7, 11, 13);
      expect(split.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  test("leftover cents go to the largest remainders", () => {
    // 100 × [1, 2, 3] / 6 = 16.67, 33.33, 50: the leftover cent goes to the first.
    expect(parts(100, 1, 2, 3)).toEqual([17, 33, 50]);
  });

  test("equal remainders: earlier lines first", () => {
    expect(parts(1, 1, 1)).toEqual([1, 0]);
    expect(parts(375, 1, 1)).toEqual([188, 187]);
    expect(parts(2, 1, 1, 1)).toEqual([1, 1, 0]);
  });

  test("fractional weights (chargeable kg)", () => {
    expect(parts(10000, "62", "37.2")).toEqual([6250, 3750]);
  });

  test("a zero-weight line gets nothing", () => {
    expect(parts(500, 0, 1)).toEqual([0, 500]);
  });

  test("one line gets everything", () => {
    expect(parts(85400, "0.001")).toEqual([85400]);
  });

  test("a zero amount splits into zeros", () => {
    expect(parts(0, 1, 2)).toEqual([0, 0]);
  });

  test("all weights zero is an error, never an equal split", () => {
    expect(allocateCents(BigInt(100), weights(0, 0))).toEqual({ ok: false, error: ALL_WEIGHTS_ZERO });
  });

  test("no lines, a negative weight or a negative amount is an error", () => {
    expect(allocateCents(BigInt(100), []).ok).toBe(false);
    expect(allocateCents(BigInt(100), weights(1, -1)).ok).toBe(false);
    expect(allocateCents(BigInt(-1), weights(1)).ok).toBe(false);
  });
});
