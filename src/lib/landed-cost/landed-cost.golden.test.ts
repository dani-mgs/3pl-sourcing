import { describe, expect, test } from "vitest";
import type { ShipmentMode } from "@/lib/tariff/calculate";
import type { EntryTypeChoice } from "@/lib/tariff/customs-fees";
import { ZERO, add, div, fromInteger, mul, parseDecimal, toCents } from "@/lib/tariff/rational";
import golden from "./__fixtures__/landed-cost.golden.json";
import type { FeeRowWithDates } from "./entry-fees";
import { compareScenarios, type ComparedScenario } from "./scenario-comparison";
import { computeScenarioTotals, type FreightBasis, type ScenarioInput, type ScenarioTotals } from "./scenario-totals";

// The Phase 1 golden cases, with duty totals passed in (the engine call is
// Phase 2). Expected values are in __fixtures__/landed-cost.golden.json.

type GoldenSku = {
  skuId: string;
  quantity: string;
  unitPriceUsd: string;
  chargeableKg: string | null;
  dutiesUsd: string;
  dutyRatesPct: string[];
  unverified: boolean;
};
type GoldenScenario = {
  label: string;
  incoterm: string;
  shipmentMode: string;
  entryTypeChoice: string;
  freightTotalUsd: string;
  freightBasis: string;
  otherCosts: { label: string; amountUsd: string }[];
  skus: GoldenSku[];
  expected: Record<string, unknown>;
};

const scenarios = golden.scenarios as unknown as Record<string, GoldenScenario>;
const FEE_ROWS = golden.feeRows as unknown as FeeRowWithDates[];

function scenarioInput(s: GoldenScenario): ScenarioInput {
  return {
    incoterm: s.incoterm,
    shipmentMode: s.shipmentMode as ShipmentMode,
    entryTypeChoice: s.entryTypeChoice as EntryTypeChoice,
    freightTotalUsd: s.freightTotalUsd,
    freightBasis: s.freightBasis as FreightBasis,
    otherCosts: s.otherCosts,
    feeRows: FEE_ROWS,
    entryDate: golden.entryDate,
    skus: s.skus.map((k) => ({
      skuId: k.skuId,
      quantity: k.quantity,
      unitPriceUsd: k.unitPriceUsd,
      chargeableKg: k.chargeableKg == null ? null : parseDecimal(k.chargeableKg),
      dutiesUsd: k.dutiesUsd,
      dutiesIncomplete: false,
      includesManualRate: false,
      unverified: k.unverified,
    })),
  };
}

function totalsOf(key: string): ScenarioTotals {
  const result = computeScenarioTotals(scenarioInput(scenarios[key]));
  if (!result.ok) throw new Error(result.error);
  return result.totals;
}

const sum = (values: bigint[]) => values.reduce((acc, v) => acc + v, BigInt(0));

describe.each(Object.keys(scenarios))("golden scenario: %s", (key) => {
  const scenario = scenarios[key];
  const expected = scenario.expected as Record<string, number | string | number[]>;
  const totals = totalsOf(key);
  const skus = totals.skus;

  test("each component and the total", () => {
    expect(Number(sum(skus.map((s) => s.productCents)))).toBe(expected.productCents);
    expect(Number(sum(skus.map((s) => s.freightCents)))).toBe(expected.freightCents);
    expect(Number(sum(skus.map((s) => s.dutiesCents)))).toBe(expected.dutiesCents);
    expect(Number(totals.entryFees.mpf.cents)).toBe(expected.mpfCents);
    expect(Number(totals.entryFees.hmf?.cents ?? BigInt(0))).toBe(expected.hmfCents);
    expect(Number(sum(skus.map((s) => s.otherCents)))).toBe(expected.otherCents);
    expect(Number(totals.totalCents)).toBe(expected.totalCents);
    expect(Number(totals.perUnitCents)).toBe(expected.perUnitCents);
  });

  test("the entry type used, and whether it was chosen", () => {
    expect(totals.entryFees.entryType).toBe(expected.entryType);
    expect(totals.entryFees.entryTypeSource).toBe(expected.entryTypeSource);
  });

  test("one MPF and one HMF for the entry, split so the shares add up", () => {
    expect(sum(totals.entryFees.mpfShares)).toBe(totals.entryFees.mpf.cents);
    expect(sum(totals.entryFees.hmfShares)).toBe(totals.entryFees.hmf?.cents ?? BigInt(0));
    if (expected.mpfSharesCents) expect(totals.entryFees.mpfShares.map(Number)).toEqual(expected.mpfSharesCents);
    if (expected.hmfSharesCents) expect(totals.entryFees.hmfShares.map(Number)).toEqual(expected.hmfSharesCents);
  });

  test("the duties passed in are the stated rates on the product cost", () => {
    for (const sku of scenario.skus) {
      const pct = sku.dutyRatesPct.reduce((acc, r) => add(acc, parseDecimal(r)), ZERO);
      const value = mul(parseDecimal(sku.unitPriceUsd), fromInteger(BigInt(sku.quantity)));
      expect(toCents(div(mul(value, pct), fromInteger(100)))).toBe(toCents(parseDecimal(sku.dutiesUsd)));
    }
  });

  test("the components add up to the total and to 100.0%", () => {
    expect(sum(totals.components.map((c) => c.cents))).toBe(totals.totalCents);
    expect(sum(totals.components.map((c) => c.shareTenths))).toBe(BigInt(1000));
  });
});

describe("golden comparison: China vs Vietnam", () => {
  const compared: ComparedScenario[] = golden.comparison.scenarios.map((key) => ({
    id: key,
    label: scenarios[key].label,
    incoterm: scenarios[key].incoterm,
    shipmentMode: scenarios[key].shipmentMode as ShipmentMode,
    totals: totalsOf(key),
  }));
  const result = compareScenarios(compared, golden.comparison.baseline);
  if (!result.ok) throw new Error(result.error);
  const byId = new Map(result.comparison.results.map((r) => [r.id, r]));

  test("China is cheaper by 233.85 per shipment, 2.34 per unit", () => {
    const vietnam = byId.get("vietnam_formal")!;
    const expected = golden.comparison.expected.vietnam_formal;
    expect(vietnam.differenceCents).toBe(BigInt(expected.differenceCents));
    expect(vietnam.perUnitDifferenceCents).toBe(BigInt(expected.perUnitDifferenceCents));
    expect(vietnam.vsBaseline).toBe(expected.vsBaseline);
    expect(vietnam.rank).toBe(expected.rank);
  });

  test("ranks China then Vietnam", () => {
    const ranked = [...result.comparison.results].sort((a, b) => Number(a.rank) - Number(b.rank)).map((r) => r.id);
    expect(ranked).toEqual(golden.comparison.expected.ranking);
    expect(byId.get("china_formal")!.rankPosition).toBe("Lowest Landed Cost");
    expect(byId.get("vietnam_formal")!.rankPosition).toBe("Highest Landed Cost");
  });

  test("Vietnam's placeholder duty raises a caution", () => {
    expect(result.comparison.caution).toEqual(["Vietnam: includes unverified rates."]);
  });
});
