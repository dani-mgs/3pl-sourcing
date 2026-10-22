import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, reviewedStatus } from "./__fixtures__/duty-tables";
import { item, scenario, tables, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import { toComparisonView } from "./comparison-view";
import { NO_LONGER_MATCHES, NOW_APPLIED, overrideCents } from "./manual-rates";
import { COVERED_BY_MANUAL_RATE, INCLUDES_MANUAL_RATE, toResultView } from "./result-view";
import { computeWorkspaceResult, type ScenarioOutcome } from "./server-compute";
import type { RateOverride, Workspace } from "./workspace-schema";

// Manual rates through the real pipeline (the batch duty loader on the stub
// tables, then computeWorkspaceResult): replace and add, as a rate or a fixed
// amount; the flags, the status and the comparison's caution; the app's own
// warnings kept; and the cases that block a SKU's total. The golden China
// case: 3.4% base ($20.40), Section 301 (China) 25% ($150.00) and Section 301
// (forced labour) 12.5% ($75.00) on $600.00 = $245.40; total $1,734.73.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DANI = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000a2";
const profiles = [{ id: DANI, first_name: "Dani" }, { id: SAM, first_name: "Sam" }];

let n = 0;
const override = (over: Partial<RateOverride>): RateOverride => ({
  id: `00000000-0000-4000-8000-0000000003${String(++n).padStart(2, "0")}`,
  kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0", amountUsd: null, reason: "Exclusion granted",
  engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: DANI, setAt: "2026-10-01T09:00:00Z",
  changedBy: SAM, changedAt: "2026-10-02T09:00:00Z", ...over,
});
const withOverrides = (overrides: RateOverride[], over: Partial<Workspace> = {}) =>
  workspace({ scenarios: [scenario({ items: [item({ overrides })] })], ...over });

async function compute(w: Workspace, t = tables()) {
  const result = await computeWorkspaceResult(stubSupabase({ ...t, profiles }), w, CALCULATED_ON);
  if (result.state !== "ready") throw new Error(result.state);
  return result;
}
const china = (outcomes: ScenarioOutcome[]) => outcomes[0];
function complete(o: ScenarioOutcome) {
  if (o.state !== "complete") throw new Error(`${o.state}: ${JSON.stringify(o.skus.map((s) => s.status))}`);
  return o;
}
const okDuty = (o: ScenarioOutcome) => {
  const s = o.skus[0];
  if (s.status !== "ok") throw new Error(s.status);
  return s.duty;
};
const cents = (usd: number) => Math.round(usd * 100);

describe("replace a layer the app applied", () => {
  test("golden China with Section 301 (China) at 0%: duties $95.40, total $1,584.73", async () => {
    const o = complete(china((await compute(withOverrides([override({})]))).scenarios));
    expect(o.totals.skus[0].dutiesCents).toBe(BigInt(9540));
    expect(o.totals.totalCents).toBe(BigInt(158473));
    expect(o.totals.status).toEqual({ incomplete: false, includesManualRate: true, unverified: false });
    const duty = okDuty(o);
    expect(duty.dutiesUsd).toBe(95.4);
    expect(duty.effectiveDutyRate).toBe("15.9%");
    const s301 = duty.lines.find((l) => l.code === "section_301_china")!;
    // The app's label, heading and source stay; the manual details are on `manual`.
    expect(s301.label).toBe("Section 301 (China) (Illustrative)");
    expect([s301.rateText, s301.amountUsd]).toEqual(["0%", 0]);
    expect(s301.manual).toMatchObject({
      kind: "replace", layerName: "Section 301 (China)", ratePercent: "0", reason: "Exclusion granted",
      setByName: "Dani", changedByName: "Sam", engineRateText: "+25%", engineAmountUsd: "150.00", note: null,
    });
    expect(s301.detail).not.toContain("Exclusion granted");
    // The other layers are the app's, unchanged; the duties are their sum.
    expect(duty.lines.filter((l) => !l.manual).map((l) => l.amountUsd)).toEqual([20.4, 75]);
    expect(duty.lines.reduce((a, l) => a + cents(l.amountUsd), 0)).toBe(9540);
  });

  test("the base duty, at a fixed amount; a rate rounds half up to the cent", async () => {
    const fixed = okDuty(complete(china((await compute(withOverrides([override({ layerKey: "base", ratePercent: null, amountUsd: "1.00" })]))).scenarios)));
    expect(fixed.lines[0]).toMatchObject({ kind: "duty", rateText: "Fixed amount", amountUsd: 1 });
    expect(fixed.dutiesUsd).toBe(226);
    // 12.3456% of $600.00 = $74.0736: $74.07. 0.0025% of $600.00 = $0.015: $0.02.
    expect(overrideCents({ ratePercent: "12.3456", amountUsd: null }, "600.00")).toBe(BigInt(7407));
    expect(overrideCents({ ratePercent: "0.0025", amountUsd: null }, "600.00")).toBe(BigInt(2));
    expect(overrideCents({ ratePercent: null, amountUsd: "12.34" }, "600.00")).toBe(BigInt(1234));
  });

  test("the app's rate changed since it was set: a note, not a block", async () => {
    const o = complete(china((await compute(withOverrides([override({ engineRateText: "+20%" })]))).scenarios));
    const s301 = okDuty(o).lines.find((l) => l.code === "section_301_china")!;
    expect(s301.manual?.note).toBe("App rate changed from +20% to +25% since this override was set");
    const w = withOverrides([override({ engineRateText: "+20%" })]);
    const view = toResultView(await compute(w), w);
    if (view.state !== "complete") throw new Error(view.state);
    expect(view.skus[0].layers.find((l) => l.manual)?.manual).toMatchObject({
      value: "0%", appRate: "+25% ($150.00)", note: "App rate changed from +20% to +25% since this override was set",
      setBy: "Set by Dani on Oct 1, 2026", changedBy: "Changed by Sam on Oct 2, 2026",
    });
  });

  test("a layer the app no longer applies blocks the SKU's total until it's removed or changed", async () => {
    const result = await compute(withOverrides([override({ layerKey: "section_232_steel" })]));
    const o = china(result.scenarios);
    expect(o.state).toBe("incomplete");
    expect(o.skus[0]).toMatchObject({
      status: "manual_rate_conflict",
      conflicts: [{ code: "no_longer_matches", layerName: "section_232_steel", message: `${NO_LONGER_MATCHES} (section_232_steel). Remove it or keep it as a manual duty.` }],
    });
    const view = toResultView(result, withOverrides([override({ layerKey: "section_232_steel" })]));
    if (view.state !== "incomplete") throw new Error(view.state);
    expect(view.missing).toEqual([{
      label: `SKU-001: ${NO_LONGER_MATCHES} (section_232_steel). Remove it or keep it as a manual duty.`,
      targetId: null,
      conflict: { overrideId: (o.skus[0] as { conflicts: { overrideId: string }[] }).conflicts[0].overrideId, code: "no_longer_matches" },
    }]);
    expect(view.skus[0].statusLabel).toBe("Manual rate to fix");
  });
});

describe("add a duty the app didn't apply", () => {
  test("a free-labelled duty as a rate and as a fixed amount", async () => {
    const w = withOverrides([
      override({ kind: "add", layerKey: null, label: "Anti-dumping", ratePercent: "10", engineRateText: null, engineAmountUsd: null }),
      override({ kind: "add", layerKey: null, label: "Countervailing", ratePercent: null, amountUsd: "12.34", engineRateText: null, engineAmountUsd: null, sortOrder: 1 }),
    ]);
    const o = complete(china((await compute(w)).scenarios));
    const duty = okDuty(o);
    expect(duty.lines.slice(-2).map((l) => [l.label, l.rateText, l.amountUsd, l.sourceLabel])).toEqual([
      ["Anti-dumping", "10%", 60, "Manual rate"],
      ["Countervailing", "Fixed amount", 12.34, "Manual rate"],
    ]);
    expect(duty.dutiesUsd).toBe(317.74);
    expect(o.totals.totalCents).toBe(BigInt(173473 + 6000 + 1234));
    expect(o.totals.status.includesManualRate).toBe(true);
  });

  test("a program pending review: added manually, its warning kept and marked covered; still incomplete", async () => {
    // Section 301 (China) loaded but not reviewed: a warning, not a line, not counted.
    const pending = { ...tables(), duty_program_review_status: [reviewedStatus("section_301_forced_labor")] };
    const before = okDuty(complete(china((await compute(withOverrides([]), pending)).scenarios)));
    expect(before.lines.map((l) => l.code)).not.toContain("section_301_china");
    expect(before.warnings.find((w) => w.programKey === "section_301_china")?.kind).toBe("pending_review");

    const w = withOverrides([override({ kind: "add", layerKey: "section_301_china", label: "Section 301 (China)", ratePercent: "25", engineRateText: null, engineAmountUsd: null })]);
    const result = await compute(w, pending);
    const o = complete(china(result.scenarios));
    const duty = okDuty(o);
    expect(duty.dutiesUsd).toBe(before.dutiesUsd + 150);
    expect(duty.incomplete).toBe(true);
    expect(o.totals.status).toMatchObject({ incomplete: true, includesManualRate: true });
    expect(duty.warnings.find((x) => x.programKey === "section_301_china")).toMatchObject({ kind: "pending_review", coveredByManualRate: true });
    expect(duty.oldestReview).toEqual(before.oldestReview);
    const view = toResultView(result, w);
    if (view.state !== "complete") throw new Error(view.state);
    expect(view.incomplete).toBe(true);
    expect(view.includesManualRate).toBe(true);
    expect(view.warnings.some((x) => x.startsWith("Section 301 (China):") && x.endsWith(COVERED_BY_MANUAL_RATE))).toBe(true);
    expect(view.skus[0].includesManualRate).toBe(true);
    expect(INCLUDES_MANUAL_RATE).toBe("Includes manual rate");
  });

  test("a program the app now applies itself blocks the total (it would be counted twice)", async () => {
    const o = china((await compute(withOverrides([override({ kind: "add", layerKey: "section_301_china", label: "Section 301 (China)", ratePercent: "25", engineRateText: null, engineAmountUsd: null })]))).scenarios);
    expect(o.state).toBe("incomplete");
    expect(o.skus[0]).toMatchObject({ status: "manual_rate_conflict", conflicts: [{ code: "now_applied", message: `${NOW_APPLIED} (Section 301 (China)).` }] });
  });
});

describe("MPF and HMF can't be overridden", () => {
  test("they aren't duty layers: a fee key matches nothing, and the fees are the app's", async () => {
    const o = china((await compute(withOverrides([override({ layerKey: "mpf" })]))).scenarios);
    expect(o.state).toBe("incomplete");
    expect(o.skus[0].status).toBe("manual_rate_conflict");
    const plain = complete(china((await compute(withOverrides([override({})]))).scenarios));
    expect([plain.totals.entryFees.mpf.cents, plain.totals.entryFees.hmf?.cents]).toEqual([BigInt(3458), BigInt(75)]);
  });
});

describe("comparing origins with a manual rate", () => {
  test("the caution names each manual rate; the ranking uses the manual figures", async () => {
    const w = workspace({ scenarios: [scenario({ items: [item({ overrides: [override({})] })] }), vietnamScenario()] });
    const result = await compute(w);
    const view = toComparisonView(result, w);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.caution).toBe("Ranking may change: China: SKU-001 Section 301 (China) manual rate.");
    expect(view.verdict?.text).toBe("China is $3.84/unit cheaper than Vietnam (19.5%).");
    expect(view.ranking.map((r) => r.perUnit)).toEqual(["$15.85", "$19.69"]);
  });

  test("no manual rate: no caution (as before)", async () => {
    const w = workspace({ scenarios: [scenario(), vietnamScenario()] });
    const view = toComparisonView(await compute(w), w);
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.caution).toBeNull();
  });
});

describe("names", () => {
  test("a staff member without a first name, or names that can't be loaded, read as 'a staff member'", async () => {
    const w = withOverrides([override({ setBy: "00000000-0000-4000-8000-0000000000ff", changedBy: "00000000-0000-4000-8000-0000000000ff" })]);
    const o = complete(china((await compute(w)).scenarios));
    expect(okDuty(o).lines.find((l) => l.manual)?.manual).toMatchObject({ setByName: "a staff member", changedByName: "a staff member" });
  });
});
