import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "./__fixtures__/duty-tables";
import { item, scenario, skuLine, tables, workspace } from "./__fixtures__/workspace-builders";
import { parseDraft, type Draft } from "./parse-draft";
import { engineRatesFor } from "./server-override-engine";
import type { RateOverride } from "./workspace-schema";

// The app's own rate and amount for a replaced layer, worked out on the
// server from the draft being saved (golden China: Section 301 (China) is
// +25%, $150.00 on $600.00). Unchanged replaces keep what was stored.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const L1 = "00000000-0000-4000-8000-000000000101";
const S1 = "00000000-0000-4000-8000-000000000201";
const O1 = "00000000-0000-4000-8000-000000000301";

function draft(overrides: unknown[], fob = "6"): Draft {
  const parsed = parseDraft({
    name: "W", entryDate: "2026-11-05", baselineRef: S1,
    skuLines: [{ ref: L1, id: L1, skuCode: "SKU-001", htsCode: "8504409541", quantity: "100" }],
    scenarios: [{
      ref: S1, id: S1, label: "China", originCountry: "CN", supplierName: "", incoterm: "FOB", shipmentMode: "Sea", entryType: "formal",
      freightTotalUsd: "854", freightBasis: "value", volumetricDivisor: "", items: [{ skuRef: L1, fobUnitPriceUsd: fob, overrides }], otherCosts: [],
    }],
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.data;
}
const replace = (over: Record<string, unknown> = {}) => ({ ref: "o1", kind: "replace", layerKey: "section_301_china", ratePercent: "0", reason: "Exclusion", ...over });
const stored = (over: Partial<RateOverride> = {}): RateOverride => ({
  id: O1, kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0", amountUsd: null, reason: "Exclusion",
  engineRateText: "+20%", engineAmountUsd: "120.00", sortOrder: 0, setBy: "u1", setAt: "2026-10-01T00:00:00Z", changedBy: "u1",
  changedAt: "2026-10-01T00:00:00Z", ...over,
});
const saved = (o: RateOverride) => workspace({ skuLines: [skuLine()], scenarios: [scenario({ items: [item({ overrides: [o] })] })] });
const first = (d: Draft) => d.scenarios[0].items[0].overrides[0];

describe("engineRatesFor", () => {
  test("a new replace: the app's rate and amount for that layer, now", async () => {
    const d = draft([replace()]);
    const r = await engineRatesFor(stubSupabase(tables()), d, null, CALCULATED_ON);
    if (!r.ok) throw new Error(r.error);
    expect(r.rates(first(d))).toEqual({ rateText: "+25%", amountUsd: "150.00" });
  });

  test("the base duty", async () => {
    const d = draft([replace({ layerKey: "base", ratePercent: "1" })]);
    const r = await engineRatesFor(stubSupabase(tables()), d, null, CALCULATED_ON);
    expect(r.ok && r.rates(first(d))).toEqual({ rateText: "3.4%", amountUsd: "20.40" });
  });

  test("unchanged since it was saved (a new reason doesn't count): what was stored, without loading duties", async () => {
    const d = draft([replace({ id: O1, ratePercent: "0.00", reason: "A better reason" })]);
    const r = await engineRatesFor(stubSupabase({}), d, saved(stored()), CALCULATED_ON);
    expect(r.ok && r.rates(first(d))).toEqual({ rateText: "+20%", amountUsd: "120.00" });
  });

  test("Keep my rate after the app's rate changed: the stored app rate is refreshed, the value kept", async () => {
    const d = draft([replace({ id: O1, ratePercent: "0", confirmAppRate: true })]);
    const r = await engineRatesFor(stubSupabase(tables()), d, saved(stored()), CALCULATED_ON);
    expect(r.ok && r.rates(first(d))).toEqual({ rateText: "+25%", amountUsd: "150.00" });
    expect(first(d).ratePercent).toBe("0");
  });

  test("a changed value is worked out again", async () => {
    const d = draft([replace({ id: O1, ratePercent: "5" })]);
    const r = await engineRatesFor(stubSupabase(tables()), d, saved(stored()), CALCULATED_ON);
    expect(r.ok && r.rates(first(d))).toEqual({ rateText: "+25%", amountUsd: "150.00" });
  });

  test("an add has no app rate", async () => {
    const d = draft([{ ref: "o1", kind: "add", label: "AD", amountUsd: "5", reason: "x" }]);
    const r = await engineRatesFor(stubSupabase({}), d, null, CALCULATED_ON);
    expect(r.ok && r.rates(first(d))).toBeNull();
  });

  test("a layer the app doesn't apply can't be replaced (add it instead)", async () => {
    const r = await engineRatesFor(stubSupabase(tables()), draft([replace({ layerKey: "section_232_steel" })]), null, CALCULATED_ON);
    expect(r).toMatchObject({
      ok: false,
      issues: [{
        path: "scenarios.0.items.0.overrides.0.layerKey",
        message: "SKU-001 in China: the app doesn't apply section_232_steel, so it can't be replaced. Add it as a manual duty instead.",
      }],
    });
  });

  test("no FOB price yet: asked for first", async () => {
    const r = await engineRatesFor(stubSupabase(tables()), draft([replace()], ""), null, CALCULATED_ON);
    expect(r).toMatchObject({
      ok: false,
      issues: [{ path: "scenarios.0.items.0.fobUnitPriceUsd", message: "SKU-001 in China: enter the FOB price before setting a manual rate." }],
    });
  });
});
