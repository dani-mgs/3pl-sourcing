import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "./__fixtures__/duty-tables";
import golden from "./__fixtures__/landed-cost.golden.json";
import { L1, L2, S1, S2, item, scenario, skuLine, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { driverText, modeLabels, skuCompareTable, toComparisonView, verdictText, vsBaselineText, type ComparisonView } from "./comparison-view";
import { computeWorkspaceResult } from "./server-compute";
import type { Workspace } from "./workspace-schema";

// Origins compared, from the pipeline's real output on the stub tables:
// the golden China vs Vietnam case, both directions, ties, per-SKU winners,
// drivers in words, and every state where there's no comparison.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function compare(w: Workspace, t = tables()): Promise<ComparisonView> {
  return toComparisonView(await computeWorkspaceResult(stubSupabase(t), w, CALCULATED_ON), w);
}
function ready(view: ComparisonView): Extract<ComparisonView, { state: "ready" }> {
  if (view.state !== "ready") throw new Error(`expected ready, got ${view.state}`);
  return view;
}
const golden2 = () => workspace({ scenarios: [scenario(), vietnamScenario()] });

describe("golden: China (baseline) vs Vietnam, formal entry, through the pipeline", () => {
  test("China is cheaper by $233.85 per shipment and $2.34/unit; the percentage is of Vietnam's cost", async () => {
    const v = ready(await compare(golden2()));
    expect(golden.comparison.expected.vietnam_formal.differenceCents).toBe(-23385);
    expect(v.verdict).toEqual({ text: "China is $2.34/unit cheaper than Vietnam (11.9%).", perShipment: "$233.85 less per shipment." });
  });

  test("ranking: China first and lowest; Vietnam against the baseline, as a share of the baseline", async () => {
    const v = ready(await compare(golden2()));
    expect(v.ranking).toEqual([
      { scenarioId: S1, rank: 1, label: "China", isBaseline: true, perUnit: "$17.35", total: "$1,734.73", position: "Lowest landed cost", vsBaseline: "Baseline" },
      { scenarioId: S2, rank: 2, label: "Vietnam", isBaseline: false, perUnit: "$19.69", total: "$1,968.58", position: "Highest landed cost", vsBaseline: "$2.34/unit more than the baseline (13.5%)" },
    ]);
  });

  test("the drivers, in words, add up to the difference", async () => {
    const w = golden2();
    const result = await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON);
    if (result.state !== "ready" || !result.comparison) throw new Error("no comparison");
    const vn = result.comparison.results.find((r) => r.id === S2)!;
    if (!Array.isArray(vn.drivers)) throw new Error("not comparable");
    expect(vn.drivers.reduce((acc, d) => acc + d.differenceCents, BigInt(0))).toBe(BigInt(-23385));
    const block = ready(toComparisonView(result, w)).drivers[0];
    expect(block).toEqual({
      scenarioId: S2,
      label: "Vietnam",
      summary: "In all: $2.34/unit more than the baseline ($233.85 per shipment).",
      lines: [
        "$2.00/unit more on product ($200.00 more per shipment)",
        "$1.99/unit more on freight ($199.00 more per shipment)",
        "$1.65/unit less on duties ($165.40 less per shipment)",
        "less than $0.01/unit more on fees (MPF and HMF) ($0.25 more per shipment)",
        "Same other costs",
      ],
      roundedNote: false,
    });
  });

  test("bars and the per-SKU table mark the baseline and the lowest in words", async () => {
    const v = ready(await compare(golden2()));
    expect(v.bars).toEqual([
      { scenarioId: S1, label: "China", perUnit: "$17.35", widthPct: 88, marks: ["Baseline", "Lowest"] },
      { scenarioId: S2, label: "Vietnam", perUnit: "$19.69", widthPct: 100, marks: [] },
    ]);
    expect(v.skuTable.columns).toEqual([
      { scenarioId: S1, label: "China", note: "Baseline" },
      { scenarioId: S2, label: "Vietnam", note: null },
    ]);
    expect(v.skuTable.rows).toEqual([{ skuCode: "SKU-001", cells: [{ text: "$17.35", mark: "Lowest" }, { text: "$19.69", mark: null }] }]);
    expect(v.notComparable).toEqual([]);
    expect(v.excluded).toEqual([]);
    expect(v.modes).toBeNull();
  });
});

describe("both directions", () => {
  test("with Vietnam as the baseline the verdict reads the same; China is less than the baseline, as a share of Vietnam's", async () => {
    const v = ready(await compare(workspace({ baselineScenarioId: S2, scenarios: [scenario({ isBaseline: false }), vietnamScenario({ isBaseline: true })] })));
    expect(v.verdict?.text).toBe("China is $2.34/unit cheaper than Vietnam (11.9%).");
    expect(v.ranking.map((r) => [r.label, r.vsBaseline])).toEqual([
      ["China", "$2.34/unit less than the baseline (11.9%)"],
      ["Vietnam", "Baseline"],
    ]);
  });

  test("a per-unit difference under half a cent reads 'less than $0.01', never '$0.00'; exactly zero stays 'Same'", () => {
    // 4 cents over 10 units is $0.004/unit, which rounds to $0.00.
    expect(driverText("fees", BigInt(-4), BigInt(10))).toBe("less than $0.01/unit more on fees (MPF and HMF) ($0.04 more per shipment)");
    expect(driverText("fees", BigInt(4), BigInt(10))).toBe("less than $0.01/unit less on fees (MPF and HMF) ($0.04 less per shipment)");
    expect(driverText("fees", BigInt(0), BigInt(10))).toBe("Same fees (MPF and HMF)");
    expect(vsBaselineText(BigInt(-4), BigInt(100000), BigInt(10))).toBe("less than $0.01/unit more than the baseline (<0.1%)");
    expect(vsBaselineText(BigInt(4), BigInt(100000), BigInt(10))).toBe("less than $0.01/unit less than the baseline (<0.1%)");
    expect(vsBaselineText(BigInt(0), BigInt(100000), BigInt(10))).toBe("Same as the baseline");
    expect(verdictText({ label: "A", totalCents: BigInt(99996) }, { label: "B", totalCents: BigInt(100000) }, BigInt(10)).text).toBe(
      "A is less than $0.01/unit cheaper than B (<0.1%).",
    );
    // Half a cent rounds up, so it's an amount.
    expect(driverText("fees", BigInt(-5), BigInt(10))).toBe("$0.01/unit more on fees (MPF and HMF) ($0.05 more per shipment)");
  });

  test("wording helpers: never a sign, ties say so", () => {
    expect(verdictText({ label: "A", totalCents: BigInt(1000) }, { label: "B", totalCents: BigInt(1000) }, BigInt(10))).toEqual({
      text: "A and B have the same landed cost ($1.00/unit).",
      perShipment: "Same cost per shipment.",
    });
    expect(vsBaselineText(BigInt(0), BigInt(1000), BigInt(10))).toBe("Same as the baseline");
    expect(vsBaselineText(BigInt(-500), BigInt(1000), BigInt(10))).toBe("$0.50/unit more than the baseline (50.0%)");
    expect(driverText("freight", BigInt(0), BigInt(10))).toBe("Same freight");
    expect(driverText("duties", BigInt(1000), BigInt(10))).toBe("$1.00/unit less on duties ($10.00 less per shipment)");
    for (const text of [vsBaselineText(BigInt(-500), BigInt(1000), BigInt(10)), driverText("fob", BigInt(-200), BigInt(10))]) {
      expect(text).not.toMatch(/[-+−]\$/);
    }
  });
});

describe("ties", () => {
  test("two identical origins: the same cost, both lowest, both marked a tie", async () => {
    const v = ready(await compare(workspace({ scenarios: [scenario(), scenario({ id: S2, label: "China 2", isBaseline: false })] })));
    expect(v.verdict?.text).toBe("China and China 2 have the same landed cost ($17.35/unit).");
    expect(v.ranking.map((r) => [r.rank, r.position])).toEqual([[1, "Lowest landed cost"], [1, "Lowest landed cost"]]);
    expect(v.skuTable.rows[0].cells.map((c) => c.mark)).toEqual(["Lowest (tie)", "Lowest (tie)"]);
  });

  test("different SKUs can win in different origins", () => {
    const table = skuCompareTable(workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })] }), [
      { scenarioId: "a", label: "A", comparable: true, isBaseline: true, perUnitBySku: new Map([[L1, BigInt(100)], [L2, BigInt(500)]]) },
      { scenarioId: "b", label: "B", comparable: true, isBaseline: false, perUnitBySku: new Map([[L1, BigInt(200)], [L2, BigInt(400)]]) },
      { scenarioId: "c", label: "C", comparable: false, isBaseline: false, perUnitBySku: new Map([[L1, BigInt(50)], [L2, BigInt(50)]]) },
    ]);
    expect(table.rows.map((r) => r.cells.map((c) => c.mark))).toEqual([
      ["Lowest", null, null],
      [null, "Lowest", null],
    ]);
    // Not comparable: labelled, and never marked lowest even when it's cheapest.
    expect(table.columns[2].note).toBe("Not comparable");
  });
});

describe("not comparable, excluded and incomplete", () => {
  test("a different incoterm: the reasons, no verdict or ranking, its own totals still shown", async () => {
    const v = ready(await compare(workspace({ scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] })));
    expect(v.notComparable).toEqual([{ label: "Vietnam", reasons: ["Incoterm EXW differs from the baseline's FOB."] }]);
    expect(v.verdict).toBeNull();
    expect(v.ranking).toEqual([]);
    expect(v.noRankingNote).toMatch(/No other origin can be compared/);
    expect(v.bars.find((b) => b.scenarioId === S2)).toMatchObject({ perUnit: "$19.69", marks: ["Not comparable"] });
    expect(v.skuTable.columns[1].note).toBe("Not comparable");
    expect(v.skuTable.rows[0].cells.map((c) => c.mark)).toEqual([null, null]);
  });

  test("an incomplete origin is left out, naming what's missing; the others are still compared", async () => {
    const mexico = scenario({ id: "s3", label: "Mexico", originCountry: "MX", isBaseline: false, freightTotalUsd: null });
    const v = ready(await compare(workspace({ scenarios: [scenario(), vietnamScenario(), mexico] })));
    expect(v.excluded).toEqual([{ label: "Mexico", reason: "Missing: Freight total (USD)." }]);
    expect(v.verdict?.text).toBe("China is $2.34/unit cheaper than Vietnam (11.9%).");
    expect(v.bars.map((b) => b.label)).toEqual(["China", "Vietnam"]);
  });

  test("an incomplete baseline: no comparison, with a note", async () => {
    const v = await compare(workspace({ scenarios: [scenario({ items: [item({ fobUnitPriceUsd: null })] }), vietnamScenario()] }));
    expect(v).toEqual({
      state: "baseline_incomplete",
      note: "The baseline (China) isn't complete yet, so origins can't be compared.",
      excluded: [{ label: "China", reason: "Missing: SKU-001: FOB price per unit (USD)." }],
    });
  });

  test("only one complete origin: too few to compare", async () => {
    const v = await compare(workspace({ scenarios: [scenario(), vietnamScenario({ freightTotalUsd: null })] }));
    expect(v).toMatchObject({ state: "too_few", excluded: [{ label: "Vietnam", reason: "Missing: Freight total (USD)." }] });
  });

  test("one origin: hidden; no result: unavailable", async () => {
    expect((await compare(workspace())).state).toBe("hidden");
    expect((await compare(workspace({ entryDate: "2026-09-01", scenarios: [scenario(), vietnamScenario()] }))).state).toBe("unavailable");
  });
});

describe("caution and modes", () => {
  test("duties not final: 'Ranking may change', naming the programs not counted", async () => {
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const v = ready(await compare(golden2(), pending));
    expect(v.caution).toMatch(/^Ranking may change: China: .*Section 301 \(China\) pending review/);
    expect(ready(await compare(golden2())).caution).toBeNull();
  });

  test("different modes are allowed and labelled", async () => {
    const v = ready(await compare(workspace({ scenarios: [scenario(), vietnamScenario({ shipmentMode: "Air" })] })));
    expect(v.modes).toBe("China by sea, Vietnam by air.");
    expect(v.verdict).not.toBeNull();
    expect(modeLabels([{ label: "A", mode: "Sea" }, { label: "B", mode: "Sea" }])).toBeNull();
  });
});
