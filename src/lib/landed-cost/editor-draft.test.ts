import { describe, expect, test } from "vitest";
import { L1, L2, S1, S2, item, scenario, skuLine, vietnamScenario, workspace } from "./__fixtures__/workspace-builders";
import {
  addSkuRow,
  applySaveResult,
  costFieldId,
  isDirty,
  issueTarget,
  itemFieldId,
  newCostRow,
  removeSkuRow,
  scenarioFieldId,
  skuFieldId,
  toEditorDraft,
  toSaveInput,
  type EditorDraft,
} from "./editor-draft";
import { addBlankOrigin } from "./origin-draft";
import { parseDraft } from "./parse-draft";

// The workspace page's draft: shared SKU rows, every origin editable, sent
// whole to saveDraftAction (whose parser must accept it), and updated with
// the ids the save returns.

const UPDATED_AT = "2026-10-21T02:02:38.123456+00:00";
const twoOrigins = () => workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })], scenarios: [scenario(), vietnamScenario()] });
const draftOf = (w = workspace()) => toEditorDraft(w)!;

describe("toEditorDraft", () => {
  test("every input as text, refs are the saved ids, the baseline by ref", () => {
    const d = draftOf();
    expect(d.baselineRef).toBe(S1);
    expect(d.scenarios[0]).toMatchObject({ ref: S1, originCountry: "CN", freightTotalUsd: "854.00", volumetricDivisor: "", supplierName: "" });
    expect(d.skus[0]).toEqual({ ref: L1, id: L1, skuCode: "SKU-001", description: "", htsCode: "8504409541", quantity: "100", dutyQuantity: "", dutyQuantityUnit: "" });
    expect(d.scenarios[0].items[L1]).toMatchObject({ fobUnitPriceUsd: "6.00", cartonGrossKg: "5" });
  });

  test("every origin is editable, with an item for every SKU line (empty when absent)", () => {
    const d = draftOf(twoOrigins());
    expect(d.scenarios.map((s) => s.ref)).toEqual([S1, S2]);
    expect(d.scenarios[1].items[L1].fobUnitPriceUsd).toBe("8.00");
    expect(d.scenarios[1].items[L2]).toMatchObject({ fobUnitPriceUsd: "", pcsPerCarton: "" });
  });

  test("the baseline isn't always the first", () => {
    const d = draftOf(workspace({ baselineScenarioId: S2, scenarios: [scenario({ isBaseline: false }), vietnamScenario({ isBaseline: true })] }));
    expect(d.baselineRef).toBe(S2);
  });

  test("no scenario: nothing to edit", () => {
    expect(toEditorDraft(workspace({ scenarios: [] }))).toBeNull();
  });
});

describe("SKU rows are shared by every origin", () => {
  test("adding one gives every origin an empty item; removing one removes them", () => {
    const added = addSkuRow(draftOf(twoOrigins()), "new-1");
    expect(added.scenarios.every((s) => s.items["new-1"]?.fobUnitPriceUsd === "")).toBe(true);
    const removed = removeSkuRow(added, L2);
    expect(removed.skus.map((s) => s.ref)).toEqual([L1, "new-1"]);
    expect(removed.scenarios.every((s) => !(L2 in s.items))).toBe(true);
  });
});

describe("toSaveInput", () => {
  test("updated_at goes back exactly as the database returned it, microseconds included", () => {
    expect(toSaveInput(draftOf(), "w1", UPDATED_AT).expectedUpdatedAt).toBe(UPDATED_AT);
  });

  test("a round trip with three origins: the parser accepts it, every origin has an item per SKU row in row order", () => {
    const base = addBlankOrigin(draftOf(twoOrigins()), { ref: "new-s", countryCode: "MX", countryName: "Mexico" });
    const d: EditorDraft = {
      ...base,
      baselineRef: S2,
      scenarios: base.scenarios.map((s) => (s.ref === "new-s" ? { ...s, otherCosts: [{ ...newCostRow("c1"), label: "Brokerage", amountUsd: "95" }] } : s)),
    };
    const parsed = parseDraft(toSaveInput(d, "w1", UPDATED_AT).draft);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.data.baselineRef).toBe(S2);
    expect(parsed.data.scenarios.map((s) => [s.ref, s.id, s.label])).toEqual([
      [S1, S1, "China"],
      [S2, S2, "Vietnam"],
      ["new-s", null, "Mexico"],
    ]);
    for (const s of parsed.data.scenarios) expect(s.items.map((i) => i.skuRef)).toEqual([L1, L2]);
    expect(parsed.data.scenarios[2].otherCosts).toEqual([{ id: null, label: "Brokerage", amountUsd: "95" }]);
  });

  test("a duty quantity cleared clears its unit", () => {
    const d = draftOf(workspace({ skuLines: [skuLine({ dutyQuantity: { value: "12", unit: "kg" } })] }));
    expect(toSaveInput(d, "w1", UPDATED_AT).draft.skuLines[0]).toMatchObject({ dutyQuantity: "12", dutyQuantityUnit: "kg" });
    const cleared = { ...d, skus: [{ ...d.skus[0], dutyQuantity: "" }] };
    expect(toSaveInput(cleared, "w1", UPDATED_AT).draft.skuLines[0]).toMatchObject({ dutyQuantity: "", dutyQuantityUnit: "" });
  });
});

describe("applySaveResult and isDirty", () => {
  test("temporary refs become the ids the save returned: SKU rows, origins, items and the baseline", () => {
    const d = { ...addBlankOrigin(addSkuRow(draftOf(), "new-1"), { ref: "new-s", countryCode: "VN", countryName: "Vietnam" }), baselineRef: "new-s" };
    const next = applySaveResult(d, { skuLines: { [L1]: L1, "new-1": L2 }, scenarios: { [S1]: S1, "new-s": S2 } });
    expect(next.skus.map((s) => [s.ref, s.id])).toEqual([[L1, L1], [L2, L2]]);
    expect(next.scenarios.map((s) => [s.ref, s.id])).toEqual([[S1, S1], [S2, S2]]);
    expect(next.baselineRef).toBe(S2);
    expect(Object.keys(next.scenarios[1].items)).toEqual([L1, L2]);
  });

  test("dirty after any edit, clean when equal", () => {
    const d = draftOf();
    expect(isDirty(d, draftOf())).toBe(false);
    expect(isDirty({ ...d, name: "Renamed" }, d)).toBe(true);
    expect(isDirty({ ...d, scenarios: [{ ...d.scenarios[0], items: { [L1]: { ...d.scenarios[0].items[L1], fobUnitPriceUsd: "7" } } }] }, d)).toBe(true);
  });
});

describe("issueTarget", () => {
  const d = (() => {
    const base = draftOf(workspace({ scenarios: [scenario(), vietnamScenario({ otherCosts: [] }), scenario({ id: "s3", label: "Mexico", isBaseline: false, items: [item()] })] }));
    return { ...base, scenarios: base.scenarios.map((s, i) => (i === 2 ? { ...s, otherCosts: [newCostRow("c1")] } : s)) };
  })();

  test.each([
    ["name", "lc-name", null],
    ["entryDate", "lc-entryDate", null],
    ["skuLines.0.quantity", skuFieldId(L1, "quantity"), null],
    ["scenarios.0.items.0.fobUnitPriceUsd", itemFieldId(S1, L1, "fobUnitPriceUsd"), S1],
    ["scenarios.1.freightTotalUsd", scenarioFieldId(S2, "freightTotalUsd"), S2],
    ["scenarios.2.label", scenarioFieldId("s3", "label"), "s3"],
    ["scenarios.2.otherCosts.0.amountUsd", costFieldId("c1", "amountUsd"), "s3"],
  ])("%s → %s", (path, id, scenarioRef) => {
    expect(issueTarget(path, d)).toEqual({ id, scenarioRef });
  });

  test("a row that isn't there, or the draft as a whole, has no field", () => {
    expect(issueTarget("skuLines.9.quantity", d)).toEqual({ id: null, scenarioRef: null });
    expect(issueTarget("baselineRef", d)).toEqual({ id: null, scenarioRef: null });
    expect(issueTarget("scenarios.7.label", d)).toEqual({ id: null, scenarioRef: null });
  });
});
