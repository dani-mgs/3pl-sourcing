import { describe, expect, test } from "vitest";
import type { ShipmentMode } from "@/lib/tariff/calculate";
import golden from "./__fixtures__/landed-cost.golden.json";
import type { FeeRowWithDates } from "./entry-fees";
import { NOT_COMPARABLE, compareScenarios, type ComparedScenario, type ScenarioResult } from "./scenario-comparison";
import { computeScenarioTotals, type ScenarioSkuInput } from "./scenario-totals";

const FEE_ROWS = golden.feeRows as unknown as FeeRowWithDates[];

type Options = {
  incoterm?: string;
  mode?: ShipmentMode;
  freight?: string;
  skus?: [string, string][];
  flags?: Partial<Pick<ScenarioSkuInput, "dutiesIncomplete" | "includesManualRate" | "unverified">>;
};

// A scenario of 1 or more SKUs ([id, quantity]) at $10.00 a unit, formal entry.
function scenario(id: string, options: Options = {}): ComparedScenario {
  const incoterm = options.incoterm ?? "FOB";
  const mode = options.mode ?? "Sea";
  const result = computeScenarioTotals({
    incoterm,
    shipmentMode: mode,
    entryTypeChoice: "formal",
    freightTotalUsd: options.freight ?? "500.00",
    freightBasis: "units",
    otherCosts: [],
    feeRows: FEE_ROWS,
    entryDate: "2026-10-04",
    skus: (options.skus ?? [["SKU-1", "100"]]).map(([skuId, quantity]) => ({
      skuId,
      quantity,
      unitPriceUsd: "10.00",
      chargeableKg: null,
      dutiesUsd: "0.00",
      dutiesIncomplete: false,
      includesManualRate: false,
      unverified: false,
      ...options.flags,
    })),
  });
  if (!result.ok) throw new Error(result.error);
  return { id, label: id, incoterm, shipmentMode: mode, totals: result.totals };
}

function compare(scenarios: ComparedScenario[], baselineId = scenarios[0].id): Map<string, ScenarioResult> {
  const result = compareScenarios(scenarios, baselineId);
  if (!result.ok) throw new Error(result.error);
  return new Map(result.comparison.results.map((r) => [r.id, r]));
}

describe("differences against the baseline", () => {
  test("baseline − scenario: positive is cheaper, with %, per unit and drivers", () => {
    const r = compare([scenario("A", { freight: "500.00" }), scenario("B", { freight: "400.00" })]).get("B")!;
    expect(r.differenceCents).toBe(BigInt(10000));
    expect(r.vsBaseline).toBe("Below Baseline");
    // 100.00 of A's 1,535.83 (1,000 + 500 + 34.58 + 1.25).
    expect(r.differencePctText).toBe("6.5%");
    expect(r.perUnitDifferenceCents).toBe(BigInt(100));
    expect(r.drivers).toEqual([
      { key: "fob", label: "Product cost (FOB)", differenceCents: BigInt(0) },
      { key: "freight", label: "Freight", differenceCents: BigInt(10000) },
      { key: "duties", label: "Duties", differenceCents: BigInt(0) },
      { key: "fees", label: "MPF and HMF", differenceCents: BigInt(0) },
      { key: "other", label: "Other costs", differenceCents: BigInt(0) },
    ]);
  });

  test("the baseline against itself is equal", () => {
    const r = compare([scenario("A")]).get("A")!;
    expect([r.isBaseline, r.differenceCents, r.vsBaseline]).toEqual([true, BigInt(0), "Equal to Baseline"]);
  });

  test("an unknown baseline is an error", () => {
    expect(compareScenarios([scenario("A")], "Z").ok).toBe(false);
  });
});

describe("ranking", () => {
  test("lowest, middle (no position) and highest; an only scenario says so", () => {
    const r = compare([scenario("A", { freight: "500" }), scenario("B", { freight: "400" }), scenario("C", { freight: "600" })]);
    expect(["A", "B", "C"].map((id) => [r.get(id)!.rank, r.get(id)!.rankPosition])).toEqual([
      [2, null],
      [1, "Lowest Landed Cost"],
      [3, "Highest Landed Cost"],
    ]);
    expect(compare([scenario("A")]).get("A")!.rankPosition).toBe("Only Comparable Scenario");
  });

  test("ties rank alike: every tied-lowest is Lowest", () => {
    const r = compare([scenario("A"), scenario("B"), scenario("C", { freight: "900" })]);
    expect([r.get("A")!.rank, r.get("B")!.rank]).toEqual([1, 1]);
    expect([r.get("A")!.rankPosition, r.get("B")!.rankPosition]).toEqual(["Lowest Landed Cost", "Lowest Landed Cost"]);
  });

  test("a scenario that isn't comparable isn't ranked and doesn't affect the others' ranks", () => {
    const r = compare([scenario("A"), scenario("B", { incoterm: "EXW", freight: "1" })]);
    expect(r.get("A")!.rankPosition).toBe("Only Comparable Scenario");
    expect(r.get("B")!.rank).toBe(NOT_COMPARABLE);
  });
});

describe("not comparable", () => {
  test("an incoterm mismatch, with a reason", () => {
    const r = compare([scenario("A"), scenario("B", { incoterm: "EXW" })]).get("B")!;
    expect(r.notComparableReasons).toEqual(["Incoterm EXW differs from the baseline's FOB."]);
    for (const key of ["differenceCents", "differencePctText", "perUnitDifferenceCents", "vsBaseline", "drivers", "rank", "rankPosition"] as const) {
      expect(r[key]).toBe(NOT_COMPARABLE);
    }
    expect(r.totalCents).toBeGreaterThan(BigInt(0));
  });

  test("different SKUs, both ways", () => {
    const r = compare([scenario("A", { skus: [["SKU-1", "100"], ["SKU-2", "50"]] }), scenario("B", { skus: [["SKU-1", "100"], ["SKU-3", "50"]] })]);
    expect(r.get("B")!.notComparableReasons).toEqual([
      "Missing SKUs the baseline has: SKU-2.",
      "Has SKUs the baseline doesn't: SKU-3.",
    ]);
  });

  test("a different quantity", () => {
    const r = compare([scenario("A"), scenario("B", { skus: [["SKU-1", "120"]] })]).get("B")!;
    expect(r.notComparableReasons).toEqual(["SKU-1: quantity 120 differs from the baseline's 100."]);
  });

  test("a different mode is allowed, and reported", () => {
    const r = compare([scenario("A"), scenario("B", { mode: "Air" })]).get("B")!;
    expect(r.notComparableReasons).toEqual([]);
    expect(r.rank).not.toBe(NOT_COMPARABLE);
    expect(r.modeNote).toBe("Ships by Air; the baseline ships by Sea.");
  });
});

describe("caution", () => {
  test("names each compared scenario that is incomplete, manual or unverified", () => {
    const result = compareScenarios(
      [
        scenario("A"),
        scenario("B", { flags: { dutiesIncomplete: true } }),
        scenario("C", { flags: { includesManualRate: true, unverified: true } }),
      ],
      "A",
    );
    expect(result.ok && result.comparison.caution).toEqual([
      "B: incomplete (duties or fees not final).",
      "C: includes a manually entered rate.",
      "C: includes unverified rates.",
    ]);
  });

  test("no caution when every compared scenario is clean", () => {
    const result = compareScenarios([scenario("A"), scenario("B")], "A");
    expect(result.ok && result.comparison.caution).toEqual([]);
  });
});
