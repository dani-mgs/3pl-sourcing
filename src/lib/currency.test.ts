import { describe, expect, test } from "vitest";
import { formatCurrency } from "./currency";

describe("formatCurrency", () => {
  test("USD always shows cents", () => {
    expect(formatCurrency(21, "USD")).toBe("$21.00");
    expect(formatCurrency(2214.5, "USD")).toBe("$2,214.50");
    expect(formatCurrency(-250, "USD")).toBe("-$250.00");
  });

  test("rounds to at most 2 decimals", () => {
    expect(formatCurrency(1.005, "USD")).toMatch(/^\$1\.0[01]$/);
    expect(formatCurrency(1234.567, "EUR")).toBe("€1,234.57");
  });

  test("zero-decimal currencies don't round away a stored fraction", () => {
    expect(formatCurrency(2.85, "JPY")).toBe("¥2.85");
    expect(formatCurrency(21, "JPY")).toBe("¥21");
    expect(formatCurrency(25000, "VND")).toBe("₫25,000");
  });
});
