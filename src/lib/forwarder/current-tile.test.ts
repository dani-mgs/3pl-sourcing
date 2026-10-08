import { describe, expect, test } from "vitest";
import { currentTileLines } from "./current-tile";

const project = (over: Partial<Parameters<typeof currentTileLines>[0]> = {}) => ({
  current_freight_cost_usd: 7792.81,
  invoice_value: 28000,
  invoice_currency: "USD",
  ...over,
});

describe("currentTileLines", () => {
  test("freight cost and invoice value, amount first then the label", () => {
    expect(currentTileLines(project())).toEqual({
      freight: "$7,792.81 Freight Cost",
      invoice: "$28,000.00 Commercial Invoice Value",
    });
  });

  test("the invoice value is shown in its own currency", () => {
    expect(currentTileLines(project({ invoice_value: 50000, invoice_currency: "EUR" })).invoice).toBe(
      "€50,000.00 Commercial Invoice Value",
    );
    expect(
      currentTileLines(project({ invoice_value: 700_000_000, invoice_currency: "VND" })).invoice,
    ).toBe("₫700,000,000 Commercial Invoice Value");
  });

  test("a value with no currency is shown as a bare number", () => {
    expect(currentTileLines(project({ invoice_currency: null })).invoice).toBe(
      "28,000.00 Commercial Invoice Value",
    );
    expect(currentTileLines(project({ invoice_currency: "" })).invoice).toBe(
      "28,000.00 Commercial Invoice Value",
    );
  });

  test("blank or zero invoice value reads Not set", () => {
    for (const invoice_value of [null, 0]) {
      expect(currentTileLines(project({ invoice_value })).invoice).toBe(
        "Commercial Invoice Value: Not set",
      );
    }
    // Even with a currency chosen.
    expect(currentTileLines(project({ invoice_value: null, invoice_currency: "EUR" })).invoice).toBe(
      "Commercial Invoice Value: Not set",
    );
  });

  test("no Freight Cost line without a current freight cost", () => {
    expect(currentTileLines(project({ current_freight_cost_usd: null })).freight).toBeNull();
  });

  test("a current freight cost of zero is still a number, so its line shows", () => {
    expect(currentTileLines(project({ current_freight_cost_usd: 0 })).freight).toBe("$0.00 Freight Cost");
  });
});
