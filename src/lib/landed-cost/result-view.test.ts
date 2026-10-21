import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "./__fixtures__/duty-tables";
import { L1, L2, S1, S2, item, scenario, skuLine, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { itemFieldId, scenarioFieldId, skuFieldId } from "./editor-draft";
import { shares, toResultView, toResultViews, type ResultView } from "./result-view";
import { computeWorkspaceResult } from "./server-compute";
import type { Workspace } from "./workspace-schema";

// The result panel's content from the server pipeline's real output: the
// golden China figures as shown, no totals at all until complete, missing
// items pointing at their fields, and every other state.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function viewOf(w: Workspace, t = tables()): Promise<ResultView> {
  return toResultView(await computeWorkspaceResult(stubSupabase(t), w, CALCULATED_ON), w);
}
function as<S extends ResultView["state"]>(view: ResultView, state: S): Extract<ResultView, { state: S }> {
  if (view.state !== state) throw new Error(`expected ${state}, got ${view.state}`);
  return view as Extract<ResultView, { state: S }>;
}

describe("complete", () => {
  test("the golden China case as shown: $17.35 per unit, $1,734.73, each part in $ and %", async () => {
    const v = as(await viewOf(workspace()), "complete");
    expect(v).toMatchObject({ perUnit: "$17.35", total: "$1,734.73", units: "100 pcs", calculatedOn: expect.any(String) });
    expect(v.breakdown).toEqual([
      { key: "product", label: "Product (FOB)", amount: "$600.00", perUnit: "$6.00", share: "34.6%" },
      { key: "freight", label: "Freight", amount: "$854.00", perUnit: "$8.54", share: "49.2%" },
      // 14.146%, rounded on its own.
      { key: "duties", label: "Duties", amount: "$245.40", perUnit: "$2.45", share: "14.1%" },
      { key: "mpf", label: "MPF", amount: "$34.58", perUnit: "$0.35", share: "2.0%" },
      { key: "hmf", label: "HMF", amount: "$0.75", perUnit: "$0.01", share: "<0.1%" },
      { key: "other", label: "Other costs", amount: "$0.00", perUnit: "$0.00", share: "0.0%" },
    ]);
    // 34.6 + 49.2 + 14.1 + 2.0 + 0 + 0 = 99.9%.
    expect(v.percentagesRounded).toBe(true);
    expect(v.skus[0]).toMatchObject({ skuCode: "SKU-001", status: "ok", statusLabel: "Complete", perUnit: "$17.35", duties: "$245.40", dutyRate: "40.9%" });
    expect(v.skus[0].layers.map((l) => [l.label, l.amount])).toEqual([
      [expect.any(String), "$20.40"],
      [expect.any(String), "$150.00"],
      [expect.any(String), "$75.00"],
    ]);
    expect(v.skus[0].lastVerified).toMatch(/last reviewed|Duty data|reviewed/i);
  });

  test("fee notes: the entry type used and why, MPF minimum applied, HMF ocean only", async () => {
    const v = as(await viewOf(workspace()), "complete");
    expect(v.feeNotes[0]).toBe("Formal entry, as chosen for this scenario.");
    expect(v.feeNotes[1]).toMatch(/^MPF .*: \$34\.58 \(.*Minimum applied\)\.$/);
    expect(v.feeNotes[2]).toMatch(/^HMF .*ocean shipments only: \$0\.75\.$/);
    const air = as(await viewOf(workspace({ scenarios: [scenario({ shipmentMode: "Air", entryType: "auto" })] })), "complete");
    expect(air.feeNotes[0]).toMatch(/^Informal entry, chosen automatically/);
    expect(air.feeNotes[2]).toBe("HMF: not charged (ocean shipments only).");
  });
});

describe("shares", () => {
  const n = (...cents: number[]) => cents.map((c) => BigInt(c));

  test("each rounded half up to 0.1% on its own", () => {
    // 1/3 each: 33.3% x 3 = 99.9%.
    expect(shares(n(100, 100, 100))).toEqual({ texts: ["33.3%", "33.3%", "33.3%"], rounded: true });
    // 2/3 = 66.67% → 66.7%, 1/3 → 33.3%: exactly 100.0%.
    expect(shares(n(200, 100))).toEqual({ texts: ["66.7%", "33.3%"], rounded: false });
    // 0.05% exactly rounds up to 0.1%.
    expect(shares(n(9995, 5)).texts).toEqual(["100.0%", "0.1%"]);
  });

  test('"<0.1%" for a part above zero under 0.05%; 0.0% for zero', () => {
    expect(shares(n(9996, 4, 0)).texts).toEqual(["100.0%", "<0.1%", "0.0%"]);
  });

  test("a zero total shows 0.0% everywhere, with no note", () => {
    expect(shares(n(0, 0))).toEqual({ texts: ["0.0%", "0.0%"], rounded: false });
  });
});

describe("incomplete: no totals, and what's missing", () => {
  test("has no per-unit or total field at all", async () => {
    const v = as(await viewOf(workspace({ scenarios: [scenario({ freightTotalUsd: null })] })), "incomplete");
    expect(v).not.toHaveProperty("perUnit");
    expect(v).not.toHaveProperty("total");
    expect(v.skus[0].perUnit).toBeNull();
    expect(v.missing).toEqual([{ label: "Freight total (USD)", targetId: scenarioFieldId(S1, "freightTotalUsd") }]);
  });

  test("a SKU with no inputs lists each field, pointing at its input", async () => {
    const v = as(await viewOf(workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })] })), "incomplete");
    expect(v.missing.map((m) => m.label)).toEqual([
      "SKU-002: FOB price per unit (USD)",
      "SKU-002: Pieces per carton",
      "SKU-002: Carton length (cm)",
      "SKU-002: Carton width (cm)",
      "SKU-002: Carton height (cm)",
      "SKU-002: Carton weight (kg)",
    ]);
    // In this origin's own fields.
    expect(v.missing[0].targetId).toBe(itemFieldId(S1, L2, "fobUnitPriceUsd"));
  });

  test("a per-unit rate asks for the duty quantity in its unit, and the editor learns the unit", async () => {
    const v = as(await viewOf(workspace({ skuLines: [skuLine({ htsCode: "0805100030" })], scenarios: [scenario({ originCountry: "MX" })] })), "incomplete");
    expect(v.missing).toEqual([{ label: "SKU-001: Net weight (kg)", targetId: skuFieldId(L1, "dutyQuantity") }]);
    expect(v.dutyQuantityUnits).toEqual({ [L1]: { token: "kg", label: "kg" } });
  });

  test("a duty error is listed and shown on its SKU; the other SKU keeps its duty", async () => {
    const v = as(
      await viewOf(
        workspace({
          skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-404", htsCode: "8504409599" })],
          scenarios: [scenario({ items: [item(), item({ skuLineId: L2 })] })],
        }),
      ),
      "incomplete",
    );
    expect(v.missing[0]).toMatchObject({ label: expect.stringMatching(/^SKU-404: .*isn't in the current HTS/), targetId: skuFieldId(L2, "htsCode") });
    expect(v.skus.find((s) => s.skuLineId === L2)).toMatchObject({ status: "duty_error", statusLabel: "Duty error", duties: null });
    expect(v.skus.find((s) => s.skuLineId === L1)).toMatchObject({ status: "ok", duties: "$245.40" });
  });
});

describe("other states", () => {
  test("entry date out of range: a prompt to change it, pointing at the date", async () => {
    const v = as(await viewOf(workspace({ entryDate: "2026-09-01" })), "entry_date_out_of_range");
    expect(v).toMatchObject({ min: expect.any(String), max: expect.any(String), targetId: "lc-entryDate" });
    expect(v.message).toMatch(/can't be earlier than/);
  });

  test("no SKU lines, duties unavailable, no scenario", async () => {
    expect((await viewOf(workspace({ skuLines: [] }))).state).toBe("no_sku_lines");
    expect(as(await viewOf(workspace(), { ...tables(), hts_releases: [] }), "duties_unavailable").message).toMatch(/HTS data/);
    expect(toResultView(null, workspace({ scenarios: [] })).state).toBe("no_scenario");
  });

  test("one view per origin, each pointing at its own fields", async () => {
    const w = workspace({ scenarios: [scenario(), vietnamScenario({ freightTotalUsd: null })] });
    const views = toResultViews(await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON), w);
    expect(as(views[S1], "complete").perUnit).toBe("$17.35");
    expect(as(views[S2], "incomplete").missing).toEqual([{ label: "Freight total (USD)", targetId: scenarioFieldId(S2, "freightTotalUsd") }]);
  });
});
