import { describe, expect, test } from "vitest";
import { parseDecimal } from "@/lib/tariff/rational";
import golden from "./__fixtures__/landed-cost.golden.json";
import type { FeeRowWithDates } from "./entry-fees";
import { computeScenarioTotals, type ScenarioInput, type ScenarioSkuInput, type ScenarioTotals } from "./scenario-totals";

const FEE_ROWS = golden.feeRows as unknown as FeeRowWithDates[];

const sku = (overrides: Partial<ScenarioSkuInput> = {}): ScenarioSkuInput => ({
  skuId: "SKU-A",
  quantity: "100",
  unitPriceUsd: "15.00",
  chargeableKg: parseDecimal("60"),
  dutiesUsd: "0.00",
  dutiesIncomplete: false,
  includesManualRate: false,
  unverified: false,
  ...overrides,
});

const scenario = (overrides: Partial<ScenarioInput> = {}): ScenarioInput => ({
  incoterm: "FOB",
  shipmentMode: "Sea",
  entryTypeChoice: "auto",
  freightTotalUsd: "1000.00",
  freightBasis: "chargeable_weight",
  skus: [sku(), sku({ skuId: "SKU-B", quantity: "300", unitPriceUsd: "5.00", chargeableKg: parseDecimal("40") })],
  otherCosts: [],
  feeRows: FEE_ROWS,
  entryDate: "2026-10-04",
  ...overrides,
});

function totals(overrides: Partial<ScenarioInput> = {}): ScenarioTotals {
  const result = computeScenarioTotals(scenario(overrides));
  if (!result.ok) throw new Error(result.error);
  return result.totals;
}

const freight = (t: ScenarioTotals) => t.skus.map((s) => Number(s.freightCents));

describe("freight split", () => {
  test("by chargeable weight (the default basis): 60 kg / 40 kg", () => {
    expect(freight(totals())).toEqual([60000, 40000]);
  });

  test("by value: 1,500.00 / 1,500.00", () => {
    expect(freight(totals({ freightBasis: "value" }))).toEqual([50000, 50000]);
  });

  test("by units: 100 / 300", () => {
    expect(freight(totals({ freightBasis: "units" }))).toEqual([25000, 75000]);
  });

  test("by weight with a SKU missing its weight is an error", () => {
    const result = computeScenarioTotals(scenario({ skus: [sku(), sku({ skuId: "SKU-B", chargeableKg: null })] }));
    expect(result).toEqual({ ok: false, error: "SKU-B has no chargeable weight, so freight can't be split by weight." });
  });
});

describe("other costs", () => {
  const costs = [{ label: "Inland trucking", amountUsd: "300.00" }, { label: "Broker fee", amountUsd: "95.00" }];

  test("never change the entered value, the duty base or the MPF", () => {
    const without = totals();
    const withCosts = totals({ otherCosts: costs });
    expect(withCosts.entryFees.enteredValueCents).toBe(without.entryFees.enteredValueCents);
    expect(withCosts.entryFees.mpf.cents).toBe(without.entryFees.mpf.cents);
    expect(withCosts.entryFees.hmf?.cents).toBe(without.entryFees.hmf?.cents);
    expect(withCosts.skus.map((s) => s.productCents)).toEqual(without.skus.map((s) => s.productCents));
    expect(withCosts.skus.map((s) => s.dutiesCents)).toEqual(without.skus.map((s) => s.dutiesCents));
    expect(withCosts.totalCents - without.totalCents).toBe(BigInt(39500));
  });

  test("are split by entered value", () => {
    expect(totals({ otherCosts: costs }).skus.map((s) => Number(s.otherCents))).toEqual([19750, 19750]);
  });

  test("an invalid line is an error", () => {
    expect(computeScenarioTotals(scenario({ otherCosts: [{ label: "", amountUsd: "1" }] })).ok).toBe(false);
  });
});

describe("per SKU and scenario figures", () => {
  test("each line adds up, and the lines add up to the total", () => {
    const t = totals({ otherCosts: [{ label: "Broker fee", amountUsd: "95.00" }] });
    for (const s of t.skus) {
      expect(s.totalCents).toBe(s.productCents + s.freightCents + s.dutiesCents + s.mpfCents + s.hmfCents + s.otherCents);
    }
    expect(t.skus.reduce((a, s) => a + s.totalCents, BigInt(0))).toBe(t.totalCents);
    expect(t.components.reduce((a, c) => a + c.cents, BigInt(0))).toBe(t.totalCents);
    expect(t.components.reduce((a, c) => a + c.shareTenths, BigInt(0))).toBe(BigInt(1000));
  });

  test("product cost with a 4-decimal unit price rounds once, at the line", () => {
    const t = totals({ skus: [sku({ quantity: "3", unitPriceUsd: "0.3333" })], freightTotalUsd: "0" });
    expect(t.skus[0].productCents).toBe(BigInt(100));
  });

  test("per-unit cost rounds half up from the exact amount", () => {
    // 1,500.00 + 600.00 freight + 17.29 MPF + 1.88 HMF = 2,119.17 over 100 units.
    const t = totals();
    expect(t.skus[0].totalCents).toBe(BigInt(211917));
    expect(t.skus[0].perUnitCents).toBe(BigInt(2119));
  });

  test("the breakdown names each component with its share", () => {
    const t = totals();
    expect(t.components.map((c) => [c.key, c.shareText])).toEqual([
      // 3,000.00 / 1,000.00 / 0 / 38.33 of 4,038.33: 74.29, 24.76, 0, 0.95 →
      // the two leftover tenths go to the largest remainders.
      ["fob", "74.3%"],
      ["freight", "24.8%"],
      ["duties", "0.0%"],
      ["fees", "0.9%"],
      ["other", "0.0%"],
    ]);
  });
});

describe("status", () => {
  test("incomplete if any SKU's duties are incomplete; the manual and unverified flags carry", () => {
    expect(totals().status).toEqual({ incomplete: false, includesManualRate: false, unverified: false });
    const t = totals({
      skus: [sku({ dutiesIncomplete: true }), sku({ skuId: "SKU-B", includesManualRate: true, unverified: true })],
    });
    expect(t.status).toEqual({ incomplete: true, includesManualRate: true, unverified: true });
  });

  test("incomplete when the entry's fiscal-year fees aren't entered", () => {
    expect(totals({ entryDate: "2027-10-15" }).status.incomplete).toBe(true);
  });
});

describe("rejected inputs", () => {
  test.each(["CIF", "CFR", "DAP", "DDP", "CPT", "CIP", "DPU", "DDU (legacy term)"])("incoterm %s names the term", (incoterm) => {
    const result = computeScenarioTotals(scenario({ incoterm }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`${incoterm} isn't supported yet`);
  });

  test.each(["EXW", "FCA", "FAS", "FOB"])("incoterm %s is accepted", (incoterm) => {
    expect(computeScenarioTotals(scenario({ incoterm })).ok).toBe(true);
  });

  test("no SKUs, a bad quantity, price, duty or freight", () => {
    expect(computeScenarioTotals(scenario({ skus: [] })).ok).toBe(false);
    expect(computeScenarioTotals(scenario({ skus: [sku({ quantity: "1.5" })] })).ok).toBe(false);
    expect(computeScenarioTotals(scenario({ skus: [sku({ unitPriceUsd: "1.23456" })] })).ok).toBe(false);
    expect(computeScenarioTotals(scenario({ skus: [sku({ dutiesUsd: "-1" })] })).ok).toBe(false);
    expect(computeScenarioTotals(scenario({ freightTotalUsd: "-1" })).ok).toBe(false);
  });

  test("a missing fee row is an error", () => {
    expect(computeScenarioTotals(scenario({ feeRows: [] })).ok).toBe(false);
  });
});
