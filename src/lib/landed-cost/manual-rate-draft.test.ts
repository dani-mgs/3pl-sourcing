import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON } from "./__fixtures__/duty-tables";
import { item, scenario, skuLine, tables, workspace } from "./__fixtures__/workspace-builders";
import { toEditorDraft, toSaveInput, type EditorDraft, type OverrideRow } from "./editor-draft";
import {
  NO_FOB_PREVIEW,
  asManualDuty,
  asOverride,
  dialogFromRow,
  enteredValue,
  isUnsaved,
  keepMyRate,
  manualRateCount,
  manualRateList,
  overrideDialog,
  previewOf,
  removeOverride,
  rowFromDialog,
  upsertOverride,
  validateDialog,
  type ManualRateDialog,
} from "./manual-rate-draft";
import { overrideCents } from "./manual-rates";
import { overrideSchema } from "./parse-draft";
import { toResultView } from "./result-view";
import { computeWorkspaceResult } from "./server-compute";
import type { RateOverride } from "./workspace-schema";

// The manual-rate editor's logic: dialog state to the draft and back, the
// same validation as saving, the preview with the server's rounding, the
// conflict conversions, and the per-origin list.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const L1 = "00000000-0000-4000-8000-000000000101";
const S1 = "00000000-0000-4000-8000-000000000201";
const O1 = "00000000-0000-4000-8000-000000000301";
const DANI = "00000000-0000-4000-8000-0000000000a1";

const saved = (over: Partial<RateOverride> = {}): RateOverride => ({
  id: O1, kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0", amountUsd: null, reason: "Exclusion granted",
  engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: DANI, setAt: "2026-10-01T09:00:00Z", changedBy: DANI,
  changedAt: "2026-10-01T09:00:00Z", ...over,
});
const ws = (overrides: RateOverride[] = []) => workspace({ skuLines: [skuLine()], scenarios: [scenario({ items: [item({ overrides })] })] });
const editorOf = (overrides: RateOverride[] = []): EditorDraft => toEditorDraft(ws(overrides))!;
const fresh = (over: Partial<ManualRateDialog> = {}): ManualRateDialog => ({
  ...overrideDialog({ scenarioRef: S1, skuRef: L1, ref: "new-1", kind: "replace", layerKey: "section_301_china", layerName: "Section 301 (China)", appRate: "+25% ($150.00)" }),
  ...over,
});

describe("dialog state and the draft", () => {
  test("a new override, applied, is a draft row; edited back, the same state", () => {
    const d = fresh({ value: "7.5", reason: "Ruling" });
    const draft = upsertOverride(editorOf(), d);
    const row = draft.scenarios[0].overrides[L1][0];
    expect(row).toEqual({ ref: "new-1", id: null, kind: "replace", layerKey: "section_301_china", label: "", ratePercent: "7.5", amountUsd: "", reason: "Ruling" });
    expect(dialogFromRow(row, { scenarioRef: S1, skuRef: L1, layerName: d.layerName, appRate: d.appRate })).toEqual(d);
    expect(rowFromDialog(fresh({ valueType: "amount", value: "150.00", reason: "r" }))).toMatchObject({ ratePercent: "", amountUsd: "150.00" });
    expect(removeOverride(draft, S1, L1, "new-1").scenarios[0].overrides).toEqual({});
  });

  test("a program added manually is labelled with its name; a free duty starts without one", () => {
    expect(overrideDialog({ scenarioRef: S1, skuRef: L1, ref: "r", kind: "add", layerKey: "section_301_china", layerName: "Section 301 (China)" }).label).toBe("Section 301 (China)");
    expect(overrideDialog({ scenarioRef: S1, skuRef: L1, ref: "r", kind: "add", layerKey: null, layerName: "" })).toMatchObject({ layerKey: "", label: "" });
  });

  test("a saved one round-trips through the editor to what saving sends", () => {
    const draft = editorOf([saved()]);
    const input = toSaveInput(upsertOverride(draft, dialogFromRow(draft.scenarios[0].overrides[L1][0], { scenarioRef: S1, skuRef: L1, layerName: "x", appRate: null })), "w", "t");
    expect(input.draft.scenarios[0].items[0].overrides).toEqual([
      { ref: O1, id: O1, kind: "replace", layerKey: "section_301_china", label: "", ratePercent: "0", amountUsd: "", reason: "Exclusion granted" },
    ]);
  });
});

describe("validation is saving's own", () => {
  const cases: [string, Partial<ManualRateDialog>][] = [
    ["no value", { value: "", reason: "r" }],
    ["a rate above 1000%", { value: "1000.0001", reason: "r" }],
    ["a rate with 5 decimals", { value: "1.12345", reason: "r" }],
    ["an amount with 3 decimals", { valueType: "amount", value: "1.005", reason: "r" }],
    ["no reason", { value: "5", reason: "  " }],
    ["a reason of 501", { value: "5", reason: "r".repeat(501) }],
    ["a free duty without a label", { kind: "add", layerKey: "", label: "", value: "5", reason: "r" }],
    ["MPF", { layerKey: "mpf", value: "5", reason: "r" }],
    ["fine", { value: "0", reason: "Exclusion" }],
    ["fine, fixed", { valueType: "amount", value: "1,234.50", reason: "r" }],
  ];
  test.each(cases)("%s: refused exactly when parse-draft refuses it, with its message", (_, over) => {
    const d = fresh(over);
    const errors = validateDialog(d, editorOf());
    const parsed = overrideSchema.safeParse(rowFromDialog(d));
    expect(Object.keys(errors).length === 0).toBe(parsed.success);
    if (!parsed.success) expect(Object.values(errors)).toContain(parsed.error.issues[0].message);
  });

  test("the per-SKU rules: one per layer, at most 10", () => {
    const draft = upsertOverride(editorOf(), fresh({ value: "1", reason: "r" }));
    expect(validateDialog(fresh({ ref: "new-2", value: "2", reason: "r" }), draft).form).toBe("This duty layer already has a manual rate.");
    expect(validateDialog(fresh({ value: "2", reason: "r" }), draft)).toEqual({});
    let full = editorOf();
    for (let i = 0; i < 10; i++) full = upsertOverride(full, fresh({ ref: `n${i}`, kind: "add", layerKey: "", label: `D${i}`, value: "1", reason: "r" }));
    expect(validateDialog(fresh({ ref: "n10", kind: "add", layerKey: "", label: "D10", value: "1", reason: "r" }), full).form).toBe(
      "A SKU can have at most 10 manual rates in an origin.",
    );
  });
});

describe("preview", () => {
  test("the server's rounding on the draft's entered value (100 x $6.00 = $600.00)", async () => {
    const draft = editorOf();
    expect(enteredValue(draft, S1, L1)).toBe("600.00");
    for (const rate of ["12.3456", "0.0025", "25", "0"]) {
      const p = previewOf(fresh({ value: rate, reason: "" }), draft);
      expect(p).toEqual({ kind: "amount", text: `$${(Number(overrideCents({ ratePercent: rate, amountUsd: null }, "600.00")) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` });
    }
    expect(previewOf(fresh({ value: "12.3456" }), draft)).toEqual({ kind: "amount", text: "$74.07" });
    expect(previewOf(fresh({ valueType: "amount", value: "1,234.5" }), draft)).toEqual({ kind: "amount", text: "$1,234.50" });
    // The same amount the server computes for the saved manual rate.
    const w = ws([saved({ ratePercent: "12.3456" })]);
    const result = await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON);
    const view = toResultView(result, w);
    if (view.state !== "complete") throw new Error(view.state);
    expect(view.skus[0].layers.find((l) => l.manual)?.amount).toBe("$74.07");
  });

  test("an unsaved FOB price counts; without one, it asks for it", () => {
    const draft = editorOf();
    const noFob = { ...draft, scenarios: [{ ...draft.scenarios[0], items: { [L1]: { ...draft.scenarios[0].items[L1], fobUnitPriceUsd: "" } } }] };
    expect(previewOf(fresh({ value: "10" }), noFob)).toEqual({ kind: "no_fob", text: NO_FOB_PREVIEW });
    const higher = { ...draft, scenarios: [{ ...draft.scenarios[0], items: { [L1]: { ...draft.scenarios[0].items[L1], fobUnitPriceUsd: "8" } } }] };
    expect(previewOf(fresh({ value: "10" }), higher)).toEqual({ kind: "amount", text: "$80.00" });
    expect(previewOf(fresh({ value: "abc" }), draft)).toEqual({ kind: "none" });
  });
});

describe("conflict conversions", () => {
  test("a replace whose layer is gone, kept as a manual duty: same value and reason, labelled with the layer", () => {
    const d = dialogFromRow(editorOf([saved()]).scenarios[0].overrides[L1][0], { scenarioRef: S1, skuRef: L1, layerName: "Section 301 (China)", appRate: "+25% ($150.00)" });
    expect(asManualDuty(d)).toMatchObject({ kind: "add", layerKey: "section_301_china", label: "Section 301 (China)", value: "0", reason: "Exclusion granted", appRate: null, id: O1 });
    expect(asManualDuty({ ...d, layerKey: "base", layerName: "Base duty" })).toMatchObject({ kind: "add", layerKey: "", label: "Base duty" });
  });

  test("an add the app now applies, kept as an override of that layer", () => {
    const d = fresh({ kind: "add", label: "Section 301 (China)", value: "25", reason: "r" });
    expect(asOverride(d, "+25% ($150.00)")).toMatchObject({ kind: "replace", layerKey: "section_301_china", label: "", appRate: "+25% ($150.00)", value: "25" });
  });

  test("keep my rate: the row asks the server to store the app's current rate, and isn't saved yet", () => {
    const draft = editorOf([saved()]);
    const kept = keepMyRate(draft, S1, L1, O1);
    const row = kept.scenarios[0].overrides[L1][0];
    expect(row.confirmAppRate).toBe(true);
    expect(isUnsaved(row, draft, S1, L1)).toBe(true);
    expect(toSaveInput(kept, "w", "t").draft.scenarios[0].items[0].overrides[0]).toMatchObject({ confirmAppRate: true });
  });
});

describe("the Manual rates list", () => {
  test("every manual rate of the origin, with its status, and the count", async () => {
    const w = ws([saved(), saved({ id: "00000000-0000-4000-8000-000000000302", kind: "add", layerKey: null, label: "Anti-dumping", ratePercent: null, amountUsd: "12.34", sortOrder: 1 })]);
    const view = toResultView(await computeWorkspaceResult(stubSupabase({ ...tables(), profiles: [{ id: DANI, first_name: "Dani" }] }), w, CALCULATED_ON), w);
    const draft = toEditorDraft(w)!;
    const withNew = upsertOverride(draft, fresh({ ref: "new-1", layerKey: "base", layerName: "Base duty", value: "1", reason: "r" }));
    const rows = manualRateList(withNew, draft, S1, view);
    expect(rows.map((r) => [r.skuCode, r.layer, r.value, r.reason, r.setBy, r.status])).toEqual([
      ["SKU-001", "Section 301 (China)", "0%", "Exclusion granted", "Set by Dani on Oct 1, 2026", "Applied"],
      ["SKU-001", "Anti-dumping", "$12.34 fixed", "Exclusion granted", "Set by Dani on Oct 1, 2026", "Applied"],
      ["SKU-001", "Base duty", "1%", "r", null, "Not saved yet"],
    ]);
    expect(manualRateCount(withNew, S1)).toBe(3);
    expect(manualRateCount(withNew, "other")).toBe(0);
  });

  test("a conflict and a changed app rate are named, with what to do", async () => {
    const w = ws([saved({ layerKey: "section_232_steel" }), saved({ id: "00000000-0000-4000-8000-000000000302", layerKey: "section_301_forced_labor", engineRateText: "+10%" })]);
    const view = toResultView(await computeWorkspaceResult(stubSupabase(tables()), w, CALCULATED_ON), w);
    const draft = toEditorDraft(w)!;
    const rows = manualRateList(draft, draft, S1, view);
    expect(rows.map((r) => [r.status, r.conflict, r.note])).toEqual([
      ["Doesn't match a duty layer", "no_longer_matches", null],
      ["App rate changed", null, "App rate changed from +10% to +12.5% since this override was set"],
    ]);
  });
});

describe("only what the user changed is unsaved", () => {
  test("unchanged saved rows aren't; edits are", () => {
    const draft = editorOf([saved()]);
    const row: OverrideRow = draft.scenarios[0].overrides[L1][0];
    expect(isUnsaved(row, draft, S1, L1)).toBe(false);
    expect(isUnsaved({ ...row, reason: "New" }, draft, S1, L1)).toBe(true);
  });
});
