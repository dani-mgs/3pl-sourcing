import { describe, expect, test } from "vitest";
import { item, scenario, skuLine, workspace } from "./__fixtures__/workspace-builders";
import { applySaveResult, removeSkuRow, toEditorDraft, toSaveInput } from "./editor-draft";
import { duplicateOrigin } from "./origin-draft";
import { parseDraft, savePayload } from "./parse-draft";
import type { RateOverride } from "./workspace-schema";

// Manual rates in a draft: what parse-draft accepts (the table's own rules,
// with friendly messages and field paths), the payload the save function
// takes (never who or when), and the editor carrying them through unchanged.

const L1 = "00000000-0000-4000-8000-000000000101";
const S1 = "00000000-0000-4000-8000-000000000201";
const O1 = "00000000-0000-4000-8000-000000000301";

const replace = (over: Record<string, unknown> = {}) => ({
  ref: "o1", id: null, kind: "replace", layerKey: "section_301_china", label: "", ratePercent: "0", amountUsd: "", reason: "Exclusion granted", ...over,
});
const draft = (overrides: unknown[]) => ({
  name: "W", entryDate: "2026-11-05", baselineRef: S1,
  skuLines: [{ ref: L1, id: L1, skuCode: "SKU-001", htsCode: "8504409541", quantity: "100" }],
  scenarios: [{
    ref: S1, id: S1, label: "China", originCountry: "CN", supplierName: "", incoterm: "FOB", shipmentMode: "Sea", entryType: "formal",
    freightTotalUsd: "854", freightBasis: "value", volumetricDivisor: "",
    items: [{ skuRef: L1, fobUnitPriceUsd: "6", overrides }], otherCosts: [],
  }],
});
function issues(overrides: unknown[]) {
  const parsed = parseDraft(draft(overrides));
  if (parsed.ok) throw new Error("expected a refusal");
  return parsed.issues;
}
const ok = (overrides: unknown[]) => {
  const parsed = parseDraft(draft(overrides));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.data;
};

describe("parsing manual rates", () => {
  test("a replace and an add are accepted, normalised; a replace has no label", () => {
    const d = ok([
      replace({ label: "ignored" }),
      { ref: "o2", kind: "add", layerKey: "", label: " Anti-dumping ", ratePercent: "", amountUsd: "1,234.50", reason: " Case A-570-001 " },
    ]);
    expect(d.scenarios[0].items[0].overrides).toEqual([
      { ref: "o1", id: null, kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0", amountUsd: null, reason: "Exclusion granted", confirmAppRate: false },
      { ref: "o2", id: null, kind: "add", layerKey: null, label: "Anti-dumping", ratePercent: null, amountUsd: "1234.50", reason: "Case A-570-001", confirmAppRate: false },
    ]);
  });

  test("an item without manual rates has none", () => {
    const d = ok([]);
    expect(d.scenarios[0].items[0].overrides).toEqual([]);
  });

  test.each([
    ["no value", replace({ ratePercent: "" }), "ratePercent", "Enter a rate or a fixed amount."],
    ["both values", replace({ amountUsd: "5" }), "ratePercent", "Enter a rate or a fixed amount, not both."],
    ["a rate above 1000%", replace({ ratePercent: "1000.0001" }), "ratePercent", "Enter the rate as a percentage from 0 to 1000, with up to 4 decimals."],
    ["a rate with 5 decimals", replace({ ratePercent: "12.12345" }), "ratePercent", "Enter the rate as a percentage from 0 to 1000, with up to 4 decimals."],
    ["a negative rate", replace({ ratePercent: "-1" }), "ratePercent", "Enter the rate as a percentage from 0 to 1000, with up to 4 decimals."],
    ["an amount with 3 decimals", replace({ ratePercent: "", amountUsd: "1.005" }), "amountUsd", "Enter the amount in USD as 0 or more, with up to 2 decimals."],
    ["no reason", replace({ reason: "  " }), "reason", "Enter a reason of 1 to 500 characters."],
    ["a reason of 501 characters", replace({ reason: "r".repeat(501) }), "reason", "Enter a reason of 1 to 500 characters."],
    ["MPF", replace({ layerKey: "mpf" }), "layerKey", "MPF and HMF can't be overridden."],
    ["HMF, in capitals", replace({ layerKey: "HMF" }), "layerKey", "MPF and HMF can't be overridden."],
    ["a replace without a layer", replace({ layerKey: "" }), "layerKey", "Choose the duty layer to replace."],
    ["an add of the base duty", replace({ kind: "add", layerKey: "base", label: "Base" }), "layerKey", "The base duty can be replaced, not added."],
    ["an add without a label", replace({ kind: "add", layerKey: "", label: "" }), "label", "Enter a label of 1 to 100 characters."],
    ["a label of 101 characters", replace({ kind: "add", layerKey: "", label: "L".repeat(101) }), "label", "Enter a label of up to 100 characters."],
    ["an unknown kind", replace({ kind: "remove" }), "kind", "Choose whether the manual rate replaces a duty or adds one."],
  ])("%s is refused at its field", (_, o, field, message) => {
    expect(issues([o])).toContainEqual({ path: `scenarios.0.items.0.overrides.0.${field}`, message });
  });

  test("at most 10 per SKU per origin, one per layer, each once", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => replace({ ref: `o${i}`, kind: "add", layerKey: "", label: `D${i}` }));
    expect(issues(eleven)).toContainEqual({ path: "scenarios.0.items.0.overrides", message: "A SKU can have at most 10 manual rates in an origin." });
    expect(issues([replace(), replace({ ref: "o2" })])).toContainEqual({
      path: "scenarios.0.items.0.overrides.1.layerKey", message: "SKU-001 in China: only one manual rate per duty layer.",
    });
    expect(issues([replace(), replace({ layerKey: "base" })])).toContainEqual({
      path: "scenarios.0.items.0.overrides.1", message: "This manual rate appears twice. Reload the workspace.",
    });
  });

  test("who and when are never read from the browser, nor the app's rate", () => {
    const d = ok([replace({ setBy: "x", setAt: "2020-01-01", changedBy: "x", engineRateText: "+99%", engineAmountUsd: "1" })]);
    const sent = savePayload(d).scenarios[0].items[0].overrides[0];
    expect(Object.keys(sent).sort()).toEqual([
      "amount_usd", "engine_amount_usd", "engine_rate_text", "kind", "label", "layer_key", "rate_percent", "reason", "ref", "sort_order",
    ]);
    expect([sent.engine_rate_text, sent.engine_amount_usd]).toEqual([null, null]);
    // The save action supplies the app's rate from the server.
    const filled = savePayload(d, () => ({ rateText: "+25%", amountUsd: "150.00" })).scenarios[0].items[0].overrides[0];
    expect([filled.engine_rate_text, filled.engine_amount_usd, filled.sort_order]).toEqual(["+25%", "150.00", 0]);
  });
});

describe("the editor carries manual rates through", () => {
  const saved: RateOverride = {
    id: O1, kind: "replace", layerKey: "section_301_china", label: null, ratePercent: "0", amountUsd: null, reason: "Exclusion granted",
    engineRateText: "+25%", engineAmountUsd: "150.00", sortOrder: 0, setBy: "u1", setAt: "2026-10-01T00:00:00Z", changedBy: "u1",
    changedAt: "2026-10-01T00:00:00Z",
  };
  const w = workspace({ id: "w1", skuLines: [skuLine({ id: L1 })], scenarios: [scenario({ id: S1, items: [item({ skuLineId: L1, overrides: [saved] })] })] });

  test("loaded, sent back as they were (without who or when), and accepted", () => {
    const editor = toEditorDraft(w)!;
    const input = toSaveInput(editor, "w1", "2026-10-01T00:00:00+00:00");
    expect(input.draft.scenarios[0].items[0].overrides).toEqual([
      { ref: O1, id: O1, kind: "replace", layerKey: "section_301_china", label: "", ratePercent: "0", amountUsd: "", reason: "Exclusion granted" },
    ]);
    const parsed = parseDraft(input.draft);
    expect(parsed.ok && parsed.data.scenarios[0].items[0].overrides[0].id).toBe(O1);
  });

  test("a new one takes its id after the save; removing the SKU drops them; a duplicated origin starts without them", () => {
    const editor = toEditorDraft(w)!;
    const withNew = {
      ...editor,
      scenarios: [{ ...editor.scenarios[0], overrides: { [L1]: [...editor.scenarios[0].overrides[L1], { ref: "tmp", id: null, kind: "add" as const, layerKey: "", label: "AD", ratePercent: "1", amountUsd: "", reason: "x" }] } }],
    };
    const after = applySaveResult(withNew, { skuLines: {}, scenarios: {}, overrides: { tmp: "00000000-0000-4000-8000-000000000302" } });
    expect(after.scenarios[0].overrides[L1].map((o) => [o.ref, o.id])).toEqual([
      [O1, O1],
      ["00000000-0000-4000-8000-000000000302", "00000000-0000-4000-8000-000000000302"],
    ]);
    expect(removeSkuRow(after, L1).scenarios[0].overrides).toEqual({});
    const dup = duplicateOrigin(after, S1, { ref: "new", countryCode: "VN", countryName: "Vietnam" }, () => "c");
    expect(dup.scenarios[1].overrides).toEqual({});
    expect(toSaveInput(dup, "w1", "t").draft.scenarios[1].items[0].overrides).toEqual([]);
  });
});
