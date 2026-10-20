import { describe, expect, test } from "vitest";
import { parseAmount, parseCents, parseWholeNumber, perUnit, shareTenths, tenthsText } from "./money";

describe("reading amounts", () => {
  test("decimals within the places allowed, commas ignored", () => {
    expect(parseCents("1,053.00")).toBe(BigInt(105300));
    expect(parseCents("0")).toBe(BigInt(0));
    expect(parseCents("1.5")).toBe(BigInt(150));
    expect(parseAmount("6.1234", 4)).not.toBeNull();
    expect(parseAmount("6.12345", 4)).toBeNull();
    for (const bad of ["-1", "1.234", "", "1e3", "abc", "1234567890123"]) expect(parseCents(bad)).toBeNull();
  });

  test("whole numbers above zero", () => {
    expect(parseWholeNumber(" 105 ")).toBe(BigInt(105));
    for (const bad of ["0", "1.0", "-3", ""]) expect(parseWholeNumber(bad)).toBeNull();
  });
});

describe("rounded figures", () => {
  test("per unit rounds half up, and half away from zero for differences", () => {
    expect(perUnit(BigInt(173473), BigInt(100)).cents).toBe(BigInt(1735));
    expect(perUnit(BigInt(-23385), BigInt(100)).cents).toBe(BigInt(-234));
    expect(perUnit(BigInt(1001), BigInt(2)).cents).toBe(BigInt(501));
  });

  test("shares in tenths of a percent", () => {
    expect(tenthsText(shareTenths(BigInt(10000), BigInt(153583)))).toBe("6.5%");
    expect(tenthsText(shareTenths(BigInt(-23385), BigInt(173473)))).toBe("-13.5%");
    expect(tenthsText(BigInt(0))).toBe("0.0%");
  });
});
