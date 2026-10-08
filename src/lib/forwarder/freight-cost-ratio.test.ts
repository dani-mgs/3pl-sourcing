import { describe, expect, test } from "vitest";
import {
  INVOICE_MISSING,
  INVOICE_NOT_USD,
  formatRatioPercent,
  freightCostRatioText,
  invoiceRatioIssue,
} from "./freight-cost-ratio";
import { freightInvoiceRatio } from "./project-summary";

const usd = (invoice_value: number | null) => ({ invoice_value, invoice_currency: "USD" });

describe("formatRatioPercent", () => {
  test("one decimal, as a percentage", () => {
    expect(formatRatioPercent(9000, 60000)).toBe("15.0%");
    expect(formatRatioPercent(9400, 60000)).toBe("15.7%");
    expect(formatRatioPercent(11500, 60000)).toBe("19.2%");
    expect(formatRatioPercent(10000, 60000)).toBe("16.7%");
    expect(formatRatioPercent(0, 60000)).toBe("0.0%");
  });

  test("a ratio over 100% is kept", () => {
    expect(formatRatioPercent(15000, 10000)).toBe("150.0%");
  });

  test("rounds half-up at one decimal, where toFixed(1) can round down", () => {
    // Exact ties: $3 on $2,000 is 0.15%, $9 is 0.45%, $11 is 0.55%.
    expect(formatRatioPercent(3, 2000)).toBe("0.2%");
    expect(formatRatioPercent(9, 2000)).toBe("0.5%");
    expect(formatRatioPercent(11, 2000)).toBe("0.6%");
    expect(formatRatioPercent(19, 2000)).toBe("1.0%");
    // Why the helper exists: the float route gets those ties wrong.
    expect(((3 / 2000) * 100).toFixed(1)).toBe("0.1");
    expect(((9 / 2000) * 100).toFixed(1)).toBe("0.4");
    // Ties that were already fine stay fine, and non-ties round to nearest.
    expect(formatRatioPercent(25, 1000)).toBe("2.5%");
    expect(formatRatioPercent(14.5, 1000)).toBe("1.5%");
    expect(formatRatioPercent(14.49, 1000)).toBe("1.4%");
    expect(formatRatioPercent(14.51, 1000)).toBe("1.5%");
    expect(formatRatioPercent(1, 3)).toBe("33.3%");
    expect(formatRatioPercent(2, 3)).toBe("66.7%");
  });

  test("large amounts stay exact", () => {
    expect(formatRatioPercent(999_999_999_999.99, 999_999_999_999.99)).toBe("100.0%");
  });
});

describe("freightCostRatioText", () => {
  test("freight only, over the project's USD invoice value", () => {
    expect(freightCostRatioText(9400, usd(60000))).toBe("15.7%");
  });

  test("blank when the invoice value is missing or zero", () => {
    expect(freightCostRatioText(9400, usd(null))).toBeNull();
    expect(freightCostRatioText(9400, usd(0))).toBeNull();
  });

  test("blank when the invoice isn't in USD, or has no currency", () => {
    expect(freightCostRatioText(9400, { invoice_value: 60000, invoice_currency: "EUR" })).toBeNull();
    expect(freightCostRatioText(9400, { invoice_value: 60000, invoice_currency: null })).toBeNull();
  });

  test("blank when the quote has no price", () => {
    expect(freightCostRatioText(null, usd(60000))).toBeNull();
  });

  test("a quote with different terms gets a ratio from its USD freight like any other", () => {
    expect(freightCostRatioText(7100, usd(60000))).toBe("11.8%");
  });
});

describe("invoiceRatioIssue", () => {
  test("says what to fix, in plain words", () => {
    expect(invoiceRatioIssue(null, "USD")).toBe(INVOICE_MISSING);
    expect(invoiceRatioIssue(0, "USD")).toBe(INVOICE_MISSING);
    expect(invoiceRatioIssue(null, null)).toBe(INVOICE_MISSING);
    expect(invoiceRatioIssue(60000, "EUR")).toBe(INVOICE_NOT_USD);
    expect(invoiceRatioIssue(60000, null)).toBe(INVOICE_NOT_USD);
    expect(invoiceRatioIssue(60000, "USD")).toBeNull();
  });

  test("agrees with the older freightInvoiceRatio about when a ratio exists", () => {
    for (const [value, currency] of [
      [60000, "USD"],
      [0, "USD"],
      [null, "USD"],
      [60000, "EUR"],
      [60000, null],
    ] as const) {
      expect(freightInvoiceRatio(9000, value, currency) == null).toBe(
        invoiceRatioIssue(value, currency) != null,
      );
    }
  });
});
