import { describe, expect, test } from "vitest";
import { parseDecimal } from "@/lib/tariff/rational";
import { computeSkuDuty, type SkuDutyInput } from "./sku-duty";

// The duty quantity must be in the rate's own unit: spellings of one unit
// match, different units never do. Nothing is converted.

const input = (rate: string, quantity: SkuDutyInput["quantity"]): SkuDutyInput => ({
  lineId: "L1",
  line: { hts_code: "0000000000", description: "Line", ancestor_descriptions: [], units: [], general_rate: rate, special_rate: null, other_rate: null },
  matchedTenDigit: false,
  release: { name: "TEST", title: null, release_start_date: null },
  originCountry: "MX",
  originIsColumn2: false,
  customsValueUsd: parseDecimal("1000.00"),
  quantity,
  programs: [],
  dutyData: { rows: [], reviews: [], schedule: [] },
  asOfDate: "2026-10-02",
  entryDate: "2026-10-02",
});

const duty = (rate: string, quantity: SkuDutyInput["quantity"]) => computeSkuDuty(input(rate, quantity));

describe("duty quantity units", () => {
  test("kg for a per-kg rate", () => {
    expect(duty("1.9¢/kg", { value: "1000", unit: "kg" })).toMatchObject({ ok: true, duty: { baseDutyUsd: 19 } });
  });

  test("spellings of the same unit match (pf.liter / pf. liter)", () => {
    expect(duty("5¢/pf. liter", { value: "100", unit: "pf.liter" })).toMatchObject({ ok: true, duty: { baseDutyUsd: 5 } });
  });

  test("pieces are never read as dozens", () => {
    expect(duty("20¢/doz.", { value: "120", unit: "each" })).toMatchObject({
      ok: false,
      code: "needs_quantity",
      unit: { token: "doz.", label: "dozen" },
    });
    expect(duty("20¢/doz.", { value: "10", unit: "doz." })).toMatchObject({ ok: true, duty: { baseDutyUsd: 2 } });
  });

  test("a compound rate needs its quantity too", () => {
    expect(duty("0.4¢/kg + 20%", null)).toMatchObject({ ok: false, code: "needs_quantity", unit: { token: "kg" } });
  });

  test("an ad valorem rate ignores a quantity, as the calculator does", () => {
    expect(duty("6%", { value: "50", unit: "kg" })).toMatchObject({ ok: true, duty: { baseDutyUsd: 60, quantityUsed: null } });
  });

  test("a rate the calculator can't evaluate", () => {
    expect(duty("The rate applicable to the article", null)).toMatchObject({ ok: false, code: "unsupported_rate" });
  });
});
