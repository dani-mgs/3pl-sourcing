import { describe, expect, test } from "vitest";
import { formatHtsCode, normalizeHtsCode } from "./hts-code";

describe("normalizeHtsCode", () => {
  test.each([
    ["7208.10.15.00", "7208101500"],
    ["7208 10 15 00", "7208101500"],
    ["7208101500", "7208101500"],
    [" 0805.10.00 ", "08051000"],
    ["6402-99-31", "64029931"],
  ])("%s → %s", (input, digits) => {
    expect(normalizeHtsCode(input)).toEqual({ ok: true, digits });
  });

  test.each(["7208.10", "720810150", "72081015001", "abc", "", "7208.10.15.00x"])(
    "refuses %j",
    (input) => {
      expect(normalizeHtsCode(input).ok).toBe(false);
    },
  );

  test("refuses Chapter 98 and 99 provisions", () => {
    const result = normalizeHtsCode("9903.88.03");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Chapter 98 and 99/);
    expect(normalizeHtsCode("9801.00.10.00").ok).toBe(false);
  });

  test("refuses chapters that don't exist", () => {
    expect(normalizeHtsCode("0012.34.56").ok).toBe(false);
    expect(normalizeHtsCode("7712.34.56").ok).toBe(false);
  });
});

describe("formatHtsCode", () => {
  test("adds the dots back", () => {
    expect(formatHtsCode("7208101500")).toBe("7208.10.15.00");
    expect(formatHtsCode("08051000")).toBe("0805.10.00");
    expect(formatHtsCode("7208")).toBe("7208");
  });
});
