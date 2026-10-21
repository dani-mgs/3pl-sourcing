import type { Scenario, Workspace } from "./workspace-schema";
import type { SkuField } from "./scenario-inputs";

// The workspace page's local draft: every input as the text in its field,
// for the one scenario the page edits (the baseline). Built from a loaded
// workspace, sent whole to saveDraftAction, and updated with the ids the save
// returns. Pure.
//
// Saved rows use their id as their ref; a new row gets a temporary ref until
// the save gives it an id. A workspace's other scenarios (Phase 4 adds them)
// aren't edited here: they're carried through every save unchanged, so saving
// never deletes them.

export type SkuRow = {
  ref: string;
  id: string | null;
  skuCode: string;
  description: string;
  htsCode: string;
  quantity: string;
  // Only for per-unit rates, in the rate's own unit; "" when not entered.
  dutyQuantity: string;
  dutyQuantityUnit: string;
  // The edited scenario's inputs for this SKU line.
  fobUnitPriceUsd: string;
  pcsPerCarton: string;
  cartonLengthCm: string;
  cartonWidthCm: string;
  cartonHeightCm: string;
  cartonGrossKg: string;
};

export type CostRow = { ref: string; id: string | null; label: string; amountUsd: string };

export type ScenarioFields = {
  ref: string;
  id: string | null;
  label: string;
  originCountry: string;
  supplierName: string;
  incoterm: string;
  shipmentMode: string;
  entryType: string;
  freightTotalUsd: string;
  freightBasis: string;
  volumetricDivisor: string;
};

// A scenario this page doesn't edit, in the action's input shape.
export type CarriedScenario = ScenarioFields & {
  items: { skuRef: string; fobUnitPriceUsd: string; pcsPerCarton: string; cartonLengthCm: string; cartonWidthCm: string; cartonHeightCm: string; cartonGrossKg: string }[];
  otherCosts: { id: string; label: string; amountUsd: string }[];
};

export type EditorDraft = {
  name: string;
  entryDate: string;
  scenario: ScenarioFields;
  skus: SkuRow[];
  otherCosts: CostRow[];
  carried: CarriedScenario[];
};

export const MAX_EDITOR_SKUS = 100;
export const MAX_EDITOR_COSTS = 20;

const text = (value: string | null) => value ?? "";

// The scenario the page edits: the baseline, else the first.
export function editedScenario(workspace: Workspace): Scenario | null {
  return workspace.scenarios.find((s) => s.isBaseline) ?? workspace.scenarios[0] ?? null;
}

function scenarioFields(s: Scenario): ScenarioFields {
  return {
    ref: s.id,
    id: s.id,
    label: s.label,
    originCountry: s.originCountry,
    supplierName: text(s.supplierName),
    incoterm: s.incoterm,
    shipmentMode: s.shipmentMode,
    entryType: s.entryType,
    freightTotalUsd: text(s.freightTotalUsd),
    freightBasis: s.freightBasis,
    volumetricDivisor: text(s.volumetricDivisor),
  };
}

const ITEM_TEXT = (i: Scenario["items"][number] | undefined) => ({
  fobUnitPriceUsd: text(i?.fobUnitPriceUsd ?? null),
  pcsPerCarton: text(i?.pcsPerCarton ?? null),
  cartonLengthCm: text(i?.cartonLengthCm ?? null),
  cartonWidthCm: text(i?.cartonWidthCm ?? null),
  cartonHeightCm: text(i?.cartonHeightCm ?? null),
  cartonGrossKg: text(i?.cartonGrossKg ?? null),
});

// Null for a workspace with no scenario: there's nothing to edit.
export function toEditorDraft(workspace: Workspace): EditorDraft | null {
  const edited = editedScenario(workspace);
  if (!edited) return null;
  const items = new Map(edited.items.map((i) => [i.skuLineId, i]));
  return {
    name: workspace.name,
    entryDate: workspace.entryDate,
    scenario: scenarioFields(edited),
    skus: workspace.skuLines.map((l) => ({
      ref: l.id,
      id: l.id,
      skuCode: l.skuCode,
      description: text(l.description),
      htsCode: l.htsCode,
      quantity: l.quantity,
      dutyQuantity: l.dutyQuantity?.value ?? "",
      dutyQuantityUnit: l.dutyQuantity?.unit ?? "",
      ...ITEM_TEXT(items.get(l.id)),
    })),
    otherCosts: edited.otherCosts.map((c) => ({ ref: c.id, id: c.id, label: c.label, amountUsd: c.amountUsd })),
    carried: workspace.scenarios
      .filter((s) => s.id !== edited.id)
      .map((s) => ({
        ...scenarioFields(s),
        items: s.items.map((i) => ({ skuRef: i.skuLineId, ...ITEM_TEXT(i) })),
        otherCosts: s.otherCosts.map((c) => ({ id: c.id, label: c.label, amountUsd: c.amountUsd })),
      })),
  };
}

export function newSkuRow(ref: string): SkuRow {
  return {
    ref, id: null, skuCode: "", description: "", htsCode: "", quantity: "", dutyQuantity: "", dutyQuantityUnit: "",
    fobUnitPriceUsd: "", pcsPerCarton: "", cartonLengthCm: "", cartonWidthCm: "", cartonHeightCm: "", cartonGrossKg: "",
  };
}

export function newCostRow(ref: string): CostRow {
  return { ref, id: null, label: "", amountUsd: "" };
}

// saveDraftAction's input. expectedUpdatedAt is passed through exactly as the
// database returned it. The edited scenario stays the baseline; every SKU
// row gets its item (so an error's index is the row's), and a carried
// scenario loses the items of SKU rows removed here.
export function toSaveInput(draft: EditorDraft, workspaceId: string, expectedUpdatedAt: string) {
  const refs = new Set(draft.skus.map((s) => s.ref));
  const { ref, id, ...fields } = draft.scenario;
  return {
    workspaceId,
    expectedUpdatedAt,
    draft: {
      name: draft.name,
      entryDate: draft.entryDate,
      baselineRef: ref,
      skuLines: draft.skus.map((s) => ({
        ref: s.ref,
        id: s.id,
        skuCode: s.skuCode,
        description: s.description,
        htsCode: s.htsCode,
        quantity: s.quantity,
        dutyQuantity: s.dutyQuantity,
        dutyQuantityUnit: s.dutyQuantity.trim() === "" ? "" : s.dutyQuantityUnit,
      })),
      scenarios: [
        {
          ref,
          id,
          ...fields,
          items: draft.skus.map((s) => ({
            skuRef: s.ref,
            fobUnitPriceUsd: s.fobUnitPriceUsd,
            pcsPerCarton: s.pcsPerCarton,
            cartonLengthCm: s.cartonLengthCm,
            cartonWidthCm: s.cartonWidthCm,
            cartonHeightCm: s.cartonHeightCm,
            cartonGrossKg: s.cartonGrossKg,
          })),
          otherCosts: draft.otherCosts.map((c) => ({ id: c.id, label: c.label, amountUsd: c.amountUsd })),
        },
        ...draft.carried.map((c) => ({ ...c, items: c.items.filter((i) => refs.has(i.skuRef)) })),
      ],
    },
  };
}

// After a save: each new SKU row and the scenario take the id the database
// gave them, which becomes their ref too. (Other costs get theirs when the
// page reloads from the server.)
export function applySaveResult(
  draft: EditorDraft,
  ids: { skuLines: Record<string, string>; scenarios: Record<string, string> },
): EditorDraft {
  const scenarioId = ids.scenarios[draft.scenario.ref] ?? draft.scenario.id;
  return {
    ...draft,
    scenario: { ...draft.scenario, ref: scenarioId ?? draft.scenario.ref, id: scenarioId },
    skus: draft.skus.map((s) => {
      const id = ids.skuLines[s.ref] ?? s.id;
      return { ...s, ref: id ?? s.ref, id };
    }),
  };
}

export function isDirty(draft: EditorDraft, saved: EditorDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

// ---- Field ids (for labels, focus from the result panel and error links) ----

export type SkuInput = Exclude<keyof SkuRow, "ref" | "id">;

export const skuFieldId = (ref: string, field: SkuInput) => `lc-sku-${ref}-${field}`;
export const costFieldId = (ref: string, field: "label" | "amountUsd") => `lc-cost-${ref}-${field}`;
export const shipmentFieldId = (field: "name" | "entryDate" | keyof ScenarioFields) => `lc-${field}`;

// The result's snake_case field names, as SKU row inputs.
export const SKU_FIELD_INPUT: Record<SkuField, SkuInput> = {
  fob_unit_price_usd: "fobUnitPriceUsd",
  pcs_per_carton: "pcsPerCarton",
  carton_length_cm: "cartonLengthCm",
  carton_width_cm: "cartonWidthCm",
  carton_height_cm: "cartonHeightCm",
  carton_gross_kg: "cartonGrossKg",
  duty_quantity: "dutyQuantity",
};

const SKU_LINE_INPUTS = new Set<string>(["skuCode", "description", "htsCode", "quantity", "dutyQuantity", "dutyQuantityUnit"]);
const ITEM_INPUTS = new Set<string>(["fobUnitPriceUsd", "pcsPerCarton", "cartonLengthCm", "cartonWidthCm", "cartonHeightCm", "cartonGrossKg"]);
const SCENARIO_INPUTS = new Set<string>([
  "label", "originCountry", "supplierName", "incoterm", "shipmentMode", "entryType", "freightTotalUsd", "freightBasis", "volumetricDivisor",
]);

// The field an action issue's path (e.g. "scenarios.0.items.2.fobUnitPriceUsd")
// points at, or null (a carried scenario, or the draft as a whole).
export function issueTarget(path: string, draft: EditorDraft): string | null {
  const p = path.split(".");
  if (p.length === 1 && (p[0] === "name" || p[0] === "entryDate")) return shipmentFieldId(p[0]);
  if (p[0] === "skuLines") {
    const row = draft.skus[Number(p[1])];
    if (!row) return null;
    return SKU_LINE_INPUTS.has(p[2]) ? skuFieldId(row.ref, p[2] as SkuInput) : skuFieldId(row.ref, "skuCode");
  }
  if (p[0] === "scenarios" && p[1] === "0") {
    if (p[2] === "items") {
      const row = draft.skus[Number(p[3])];
      if (!row) return null;
      return ITEM_INPUTS.has(p[4]) ? skuFieldId(row.ref, p[4] as SkuInput) : skuFieldId(row.ref, "fobUnitPriceUsd");
    }
    if (p[2] === "otherCosts") {
      const row = draft.otherCosts[Number(p[3])];
      if (!row) return null;
      return costFieldId(row.ref, p[4] === "amountUsd" ? "amountUsd" : "label");
    }
    if (SCENARIO_INPUTS.has(p[2])) return shipmentFieldId(p[2] as keyof ScenarioFields);
  }
  return null;
}
