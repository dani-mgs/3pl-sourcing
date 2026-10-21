import { describe, expect, test } from "vitest";
import { L1, L2, S1, S2, item, scenario, skuLine, workspace } from "./__fixtures__/workspace-builders";
import {
  applySaveResult,
  isDirty,
  issueTarget,
  newCostRow,
  newSkuRow,
  skuFieldId,
  toEditorDraft,
  toSaveInput,
  type EditorDraft,
} from "./editor-draft";
import { parseDraft } from "./parse-draft";

// The workspace page's draft: loaded from a workspace, sent whole to
// saveDraftAction (whose parser must accept it), and updated with the ids
// the save returns.

const UPDATED_AT = "2026-10-21T02:02:38.123456+00:00";
const draftOf = (w = workspace()) => toEditorDraft(w)!;

describe("toEditorDraft", () => {
  test("every input as text, refs are the saved ids", () => {
    const d = draftOf();
    expect(d.scenario).toMatchObject({ ref: S1, id: S1, originCountry: "CN", freightTotalUsd: "854.00", volumetricDivisor: "", supplierName: "" });
    expect(d.skus[0]).toMatchObject({ ref: L1, id: L1, skuCode: "SKU-001", fobUnitPriceUsd: "6.00", cartonGrossKg: "5", description: "", dutyQuantity: "" });
  });

  test("edits the baseline; other scenarios are carried as they are", () => {
    const d = draftOf(
      workspace({
        baselineScenarioId: S2,
        scenarios: [scenario({ isBaseline: false }), scenario({ id: S2, label: "Vietnam", originCountry: "VN", isBaseline: true })],
      }),
    );
    expect(d.scenario.id).toBe(S2);
    expect(d.carried.map((c) => c.id)).toEqual([S1]);
    expect(d.carried[0].items).toEqual([expect.objectContaining({ skuRef: L1, fobUnitPriceUsd: "6.00" })]);
  });

  test("a SKU line with no item in the edited scenario has empty inputs", () => {
    const d = draftOf(workspace({ skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })] }));
    expect(d.skus[1]).toMatchObject({ ref: L2, fobUnitPriceUsd: "", pcsPerCarton: "" });
  });

  test("no scenario: nothing to edit", () => {
    expect(toEditorDraft(workspace({ scenarios: [] }))).toBeNull();
  });
});

describe("toSaveInput", () => {
  test("updated_at goes back exactly as the database returned it, microseconds included", () => {
    expect(toSaveInput(draftOf(), "w1", UPDATED_AT).expectedUpdatedAt).toBe(UPDATED_AT);
  });

  test("the action's parser accepts it, new rows keep their temporary refs", () => {
    const d: EditorDraft = {
      ...draftOf(),
      skus: [...draftOf().skus, { ...newSkuRow("new-1"), skuCode: "SKU-NEW", htsCode: "6402.99.31.10", quantity: "10" }],
      otherCosts: [{ ...newCostRow("new-2"), label: "Brokerage", amountUsd: "95" }],
    };
    const input = toSaveInput(d, "w1", UPDATED_AT);
    const parsed = parseDraft(input.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.data.skuLines.map((l) => [l.ref, l.id])).toEqual([[L1, L1], ["new-1", null]]);
    // One item per SKU row, in row order (so an error's index is the row's).
    expect(parsed.data.scenarios[0].items.map((i) => i.skuRef)).toEqual([L1, "new-1"]);
    expect(parsed.data.scenarios[0].otherCosts).toEqual([{ id: null, label: "Brokerage", amountUsd: "95" }]);
    expect(parsed.data.baselineRef).toBe(S1);
  });

  test("a removed SKU row's items leave the carried scenarios too", () => {
    const w = workspace({
      skuLines: [skuLine(), skuLine({ id: L2, skuCode: "SKU-002" })],
      scenarios: [scenario(), scenario({ id: S2, label: "Vietnam", isBaseline: false, items: [item(), item({ skuLineId: L2 })] })],
    });
    const d = draftOf(w);
    const input = toSaveInput({ ...d, skus: d.skus.filter((s) => s.ref !== L2) }, "w1", UPDATED_AT);
    expect(input.draft.scenarios[1].items.map((i) => i.skuRef)).toEqual([L1]);
    expect(parseDraft(input.draft).ok).toBe(true);
  });

  test("a duty quantity cleared clears its unit", () => {
    const d = draftOf(workspace({ skuLines: [skuLine({ dutyQuantity: { value: "12", unit: "kg" } })] }));
    expect(toSaveInput(d, "w1", UPDATED_AT).draft.skuLines[0]).toMatchObject({ dutyQuantity: "12", dutyQuantityUnit: "kg" });
    const cleared = { ...d, skus: [{ ...d.skus[0], dutyQuantity: "" }] };
    expect(toSaveInput(cleared, "w1", UPDATED_AT).draft.skuLines[0]).toMatchObject({ dutyQuantity: "", dutyQuantityUnit: "" });
  });
});

describe("applySaveResult and isDirty", () => {
  test("temporary refs become the ids the save returned", () => {
    const d: EditorDraft = { ...draftOf(), skus: [...draftOf().skus, newSkuRow("new-1")] };
    const next = applySaveResult(d, { skuLines: { [L1]: L1, "new-1": L2 }, scenarios: { [S1]: S1 } });
    expect(next.skus.map((s) => [s.ref, s.id])).toEqual([[L1, L1], [L2, L2]]);
    expect(next.scenario).toMatchObject({ ref: S1, id: S1 });
  });

  test("dirty after any edit, clean when equal", () => {
    const d = draftOf();
    expect(isDirty(d, draftOf())).toBe(false);
    expect(isDirty({ ...d, name: "Renamed" }, d)).toBe(true);
    expect(isDirty({ ...d, skus: [{ ...d.skus[0], quantity: "101" }] }, d)).toBe(true);
  });
});

describe("issueTarget", () => {
  const d: EditorDraft = { ...draftOf(), otherCosts: [newCostRow("c1")] };

  test.each([
    ["name", "lc-name"],
    ["entryDate", "lc-entryDate"],
    ["skuLines.0.quantity", skuFieldId(L1, "quantity")],
    ["skuLines.0", skuFieldId(L1, "skuCode")],
    ["scenarios.0.items.0.fobUnitPriceUsd", skuFieldId(L1, "fobUnitPriceUsd")],
    ["scenarios.0.freightTotalUsd", "lc-freightTotalUsd"],
    ["scenarios.0.otherCosts.0.amountUsd", "lc-cost-c1-amountUsd"],
  ])("%s → %s", (path, id) => {
    expect(issueTarget(path, d)).toBe(id);
  });

  test("a carried scenario, or a row that isn't there, has no field here", () => {
    expect(issueTarget("scenarios.1.label", d)).toBeNull();
    expect(issueTarget("skuLines.9.quantity", d)).toBeNull();
    expect(issueTarget("baselineRef", d)).toBeNull();
  });
});
