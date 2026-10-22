import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "./__fixtures__/duty-tables";
import { scenario, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { toComparisonView } from "./comparison-view";
import { toResultViews } from "./result-view";
import { computeWorkspaceResult } from "./server-compute";
import { buildSnapshotRow, centsToMoney, moneyToCents, parseSnapshot, restoreSnapshot, SNAPSHOT_SCHEMA_VERSION } from "./snapshot-schema";
import type { Workspace } from "./workspace-schema";

// A locked version: built from the pipeline's real result on the stub
// tables, stored as JSON (money as exact strings, no float or bigint), read
// back through the Zod schema and shown by the same views as the live page,
// with the same text.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

async function lock(w: Workspace, t = tables()) {
  const result = await computeWorkspaceResult(stubSupabase(t), w, CALCULATED_ON);
  return { result, built: buildSnapshotRow(w, result) };
}
// Stored ids are real uuids.
const W = { id: "00000000-0000-4000-8000-000000000001", ownerId: "00000000-0000-4000-8000-0000000000a1" };
const golden = () => workspace({ ...W, scenarios: [scenario(), vietnamScenario()] });
// As the database stores and returns it.
const throughJson = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

describe("money codec", () => {
  test("exact decimal strings both ways, signs kept", () => {
    for (const cents of [BigInt(0), BigInt(5), BigInt(173473), BigInt(-23385), BigInt("123456789012345")]) {
      expect(moneyToCents(centsToMoney(cents))).toBe(cents);
    }
    expect([centsToMoney(BigInt(173473)), centsToMoney(BigInt(-5))]).toEqual(["1734.73", "-0.05"]);
  });
});

describe("golden China vs Vietnam: build, store, read back", () => {
  test("the row: summary columns, release, as-of date; no float or bigint anywhere", async () => {
    const { built } = await lock(golden());
    if (!built.ok) throw new Error(built.error);
    const row = built.row;
    expect(row).toMatchObject({
      as_of_date: CALCULATED_ON,
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      origin_count: 2,
      baseline_label: "China",
      baseline_per_unit_usd: "17.35",
      incomplete: false,
    });
    expect(row.result.origins.map((o) => [o.label, o.totalUsd, o.perUnitUsd])).toEqual([
      ["China", "1734.73", "17.35"],
      ["Vietnam", "1968.58", "19.69"],
    ]);
    // Every number in the stored JSON is a count or a rate, never money.
    const numbers: string[] = [];
    JSON.stringify(row, (key, value) => {
      if (typeof value === "number") numbers.push(key);
      return value;
    });
    const allowed = new Set(["schema_version", "origin_count", "days", "rank", "indicativePct", "fiscalYear"]);
    expect(numbers.filter((k) => !allowed.has(k))).toEqual([]);
  });

  test("the per-SKU components add up to each SKU and origin total, as the database checks", async () => {
    const { built } = await lock(golden());
    if (!built.ok) throw new Error(built.error);
    for (const o of built.row.result.origins) {
      let total = BigInt(0);
      for (const s of o.skus) {
        const parts = [s.productUsd, s.freightUsd, s.dutiesUsd, s.mpfUsd, s.hmfUsd, s.otherUsd].map(moneyToCents);
        expect(parts.reduce((a, b) => a + b, BigInt(0))).toBe(moneyToCents(s.totalUsd));
        total += moneyToCents(s.totalUsd);
      }
      expect(total).toBe(moneyToCents(o.totalUsd));
      expect(o.skus.reduce((a, s) => a + moneyToCents(s.mpfUsd), BigInt(0))).toBe(moneyToCents(o.entryFees.mpf.usd));
    }
  });

  test("every check save_landed_cost_snapshot() makes holds for the builder's real output", async () => {
    const w = golden();
    const { built } = await lock(w);
    if (!built.ok) throw new Error(built.error);
    const { row } = built;
    const cents = moneyToCents;
    // Half up to the cent, as landed_cost_snapshot_per_unit().
    const perUnit = (total: bigint, units: bigint) => (total * BigInt(2) + units) / (units * BigInt(2));
    // The top level and the origin, SKU and duty keys are exactly the function's allow-lists.
    expect(Object.keys(row).sort()).toEqual([
      "as_of_date", "baseline_label", "baseline_per_unit_usd", "entry_date", "hts_release_name", "hts_release_start_date", "hts_release_title",
      "incomplete", "inputs", "origin_count", "result", "schema_version", "workspace_id", "workspace_name", "workspace_updated_at",
    ]);
    for (const o of row.result.origins) {
      expect(Object.keys(o).sort()).toEqual(["entryFees", "isBaseline", "label", "otherCosts", "perUnitUsd", "scenarioId", "skus", "status", "totalUsd", "units"]);
      const s = w.scenarios.find((x) => x.id === o.scenarioId)!;
      const sum = (pick: (k: (typeof o.skus)[number]) => string) => o.skus.reduce((acc, k) => acc + cents(pick(k)), BigInt(0));
      for (const k of o.skus) {
        const line = w.skuLines.find((l) => l.id === k.skuLineId)!;
        const fob = s.items.find((i) => i.skuLineId === k.skuLineId)!.fobUnitPriceUsd!;
        expect(k.quantity).toBe(line.quantity);
        expect(cents(k.productUsd)).toBe(BigInt(Math.round(Number(line.quantity) * Number(fob) * 100)));
        expect(cents(k.dutiesUsd)).toBe(cents(k.duty.dutiesUsd));
        expect(cents(k.perUnitUsd)).toBe(perUnit(cents(k.totalUsd), BigInt(k.quantity)));
        expect(Object.keys(k.duty).sort()).toEqual([
          "dutiesUsd", "dutyReviews", "effectiveDutyRate", "htsCode", "incomplete", "lines", "oldestReview", "rateColumn", "rateText", "scheduledChanges", "warnings",
        ]);
      }
      expect(sum((k) => k.totalUsd)).toBe(cents(o.totalUsd));
      expect(cents(o.perUnitUsd)).toBe(perUnit(cents(o.totalUsd), BigInt(o.units)));
      expect(sum((k) => k.freightUsd)).toBe(cents(Number(s.freightTotalUsd).toFixed(2)));
      expect(sum((k) => k.productUsd)).toBe(cents(o.entryFees.enteredValueUsd));
      expect(sum((k) => k.mpfUsd)).toBe(cents(o.entryFees.mpf.usd));
      expect(sum((k) => k.hmfUsd)).toBe(o.entryFees.hmf ? cents(o.entryFees.hmf.usd) : BigInt(0));
      expect(sum((k) => k.otherUsd)).toBe(o.otherCosts.reduce((acc, c) => acc + cents(c.amountUsd), BigInt(0)));
    }
    const baseline = row.result.origins.find((o) => o.isBaseline)!;
    for (const r of row.result.comparison!.results) {
      const o = row.result.origins.find((x) => x.scenarioId === r.id)!;
      expect(r.totalUsd).toBe(o.totalUsd);
      if (!r.comparable) continue;
      expect(cents(r.differenceUsd!)).toBe(cents(baseline.totalUsd) - cents(o.totalUsd));
      expect(r.drivers!.reduce((acc, d) => acc + cents(d.differenceUsd), BigInt(0))).toBe(cents(r.differenceUsd!));
    }
  });

  test("read back through Zod, the views show exactly what the live page showed", async () => {
    const w = golden();
    const { result, built } = await lock(w);
    if (!built.ok) throw new Error(built.error);
    const parsed = parseSnapshot(throughJson({ schema_version: built.row.schema_version, inputs: built.row.inputs, result: built.row.result }) as never);
    if (!parsed.ok) throw new Error("didn't parse");
    const restored = restoreSnapshot(parsed.snapshot);
    expect(restored.workspace).toEqual(w);
    expect(toResultViews(restored.result, restored.workspace)).toEqual(toResultViews(result, w));
    expect(toComparisonView(restored.result, restored.workspace)).toEqual(toComparisonView(result, w));
    expect(toComparisonView(restored.result, restored.workspace)).toMatchObject({
      verdict: { text: "China is $2.34/unit cheaper than Vietnam (11.9%).", perShipment: "$233.85 less per shipment." },
    });
  });

  test("not comparable and pending duties survive the round trip too", async () => {
    const w = workspace({ ...W, scenarios: [scenario(), vietnamScenario({ incoterm: "EXW" })] });
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const { result, built } = await lock(w, pending);
    if (!built.ok) throw new Error(built.error);
    expect(built.row.incomplete).toBe(true);
    const parsed = parseSnapshot(throughJson(built.row) as never);
    if (!parsed.ok) throw new Error("didn't parse");
    const restored = restoreSnapshot(parsed.snapshot);
    expect(toComparisonView(restored.result, restored.workspace)).toEqual(toComparisonView(result, w));
    expect(toResultViews(restored.result, restored.workspace)).toEqual(toResultViews(result, w));
  });
});

describe("refused or unreadable", () => {
  test("an incomplete origin can't be locked", async () => {
    const { built } = await lock(workspace({ scenarios: [scenario(), vietnamScenario({ freightTotalUsd: null })] }));
    expect(built).toEqual({ ok: false, error: "Complete every origin before locking." });
  });

  test("bad stored data or another schema version doesn't parse", async () => {
    const { built } = await lock(golden());
    if (!built.ok) throw new Error(built.error);
    const good = throughJson(built.row) as { schema_version: number; inputs: unknown; result: { origins: { totalUsd: unknown }[] } };
    expect(parseSnapshot({ ...good, schema_version: 3 }).ok).toBe(false);
    good.result.origins[0].totalUsd = 1734.73;
    expect(parseSnapshot(good).ok).toBe(false);
    expect(parseSnapshot({ schema_version: 1, inputs: null, result: {} }).ok).toBe(false);
  });
});
