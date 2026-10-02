import { describe, expect, test } from "vitest";
import { add, compare, div, fraction, mul, parseDecimal, toCents, toFixed } from "./rational";

const cents = (value: string) => toCents(parseDecimal(value));

describe("parseDecimal", () => {
  test("reads decimal strings and numbers exactly", () => {
    expect(parseDecimal("0.3464")).toEqual({ n: BigInt(433), d: BigInt(1250) });
    expect(parseDecimal(670.86)).toEqual(parseDecimal("670.86"));
    expect(parseDecimal("10000")).toEqual({ n: BigInt(10000), d: BigInt(1) });
    expect(parseDecimal(0.0000738)).toEqual(parseDecimal("0.0000738"));
  });

  test("refuses anything that isn't a plain decimal", () => {
    expect(() => parseDecimal("1e3")).toThrow();
    expect(() => parseDecimal("12,000")).toThrow();
    expect(() => parseDecimal("")).toThrow();
    expect(() => parseDecimal(Number.NaN)).toThrow();
  });
});

describe("toCents", () => {
  test("rounds half up to the cent", () => {
    expect(toCents(mul(parseDecimal("1001.25"), parseDecimal("0.06")))).toBe(BigInt(6008)); // 60.075
    expect(cents("0.004")).toBe(BigInt(0));
    expect(cents("0.005")).toBe(BigInt(1));
    expect(cents("34.64")).toBe(BigInt(3464));
  });

  test("keeps fractions exact until rounding (33 1/3% of $1,000)", () => {
    const pct = add(parseDecimal("33"), fraction(1, 3));
    expect(toCents(div(mul(parseDecimal("1000"), pct), parseDecimal("100")))).toBe(BigInt(33333));
  });

  test("avoids binary-float drift (0.1 + 0.2)", () => {
    expect(toCents(add(parseDecimal("0.1"), parseDecimal("0.2")))).toBe(BigInt(30));
  });
});

describe("toFixed and compare", () => {
  test("formats with fixed places, rounding half up", () => {
    expect(toFixed(parseDecimal("3.8"), 2)).toBe("3.80");
    expect(toFixed(fraction(1, 3), 4)).toBe("0.3333");
    expect(toFixed(fraction(2, 3), 2)).toBe("0.67");
    expect(toFixed(parseDecimal("0.005"), 2)).toBe("0.01");
  });

  test("compares exactly", () => {
    expect(compare(parseDecimal("2500"), parseDecimal("2500.00"))).toBe(0);
    expect(compare(parseDecimal("2500.01"), parseDecimal("2500"))).toBe(1);
    expect(compare(fraction(1, 3), parseDecimal("0.3333"))).toBe(1);
  });
});
