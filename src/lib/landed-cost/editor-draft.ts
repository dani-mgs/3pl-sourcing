import type { Scenario, Workspace } from "./workspace-schema";
import type { SkuField } from "./scenario-inputs";

// The workspace page's local draft: every input as the text in its field.
// SKU lines are shared by every origin; each origin (scenario) has its own
// shipment fields, per-SKU FOB price and packing, freight and other costs.
// Built from a loaded workspace, sent whole to saveDraftAction, and updated
// with the ids the save returns. Pure.
//
// Saved rows use their id as their ref; a new row gets a temporary ref until
// the save gives it an id.

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
};

export type ItemInputs = {
  fobUnitPriceUsd: string;
  pcsPerCarton: string;
  cartonLengthCm: string;
  cartonWidthCm: string;
  cartonHeightCm: string;
  cartonGrossKg: string;
};

export type CostRow = { ref: string; id: string | null; label: string; amountUsd: string };

// A manual rate on one SKU in one origin (manual-rates.ts), as text. Carried
// through the draft as it was loaded (the editing UI comes later), so a save
// keeps it. Who set or changed it, and when, are never sent.
export type OverrideRow = {
  ref: string;
  id: string | null;
  kind: "replace" | "add";
  layerKey: string;
  label: string;
  ratePercent: string;
  amountUsd: string;
  reason: string;
};

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

export type ScenarioDraft = ScenarioFields & {
  // This origin's inputs per SKU row, by the row's ref (empty when absent).
  items: Record<string, ItemInputs>;
  // This origin's manual rates per SKU row, by the row's ref (absent: none).
  overrides: Record<string, OverrideRow[]>;
  otherCosts: CostRow[];
};

export type EditorDraft = {
  name: string;
  entryDate: string;
  baselineRef: string;
  skus: SkuRow[];
  scenarios: ScenarioDraft[];
};

export const MAX_EDITOR_SKUS = 100;
export const MAX_EDITOR_COSTS = 20;

export const ITEM_INPUT_KEYS = [
  "fobUnitPriceUsd",
  "pcsPerCarton",
  "cartonLengthCm",
  "cartonWidthCm",
  "cartonHeightCm",
  "cartonGrossKg",
] as const satisfies readonly (keyof ItemInputs)[];

export const EMPTY_ITEM: ItemInputs = {
  fobUnitPriceUsd: "", pcsPerCarton: "", cartonLengthCm: "", cartonWidthCm: "", cartonHeightCm: "", cartonGrossKg: "",
};

const text = (value: string | null) => value ?? "";

// The baseline, else the first scenario.
export function baselineScenario(workspace: Workspace): Scenario | null {
  return workspace.scenarios.find((s) => s.isBaseline) ?? workspace.scenarios[0] ?? null;
}

function itemInputs(i: Scenario["items"][number] | undefined): ItemInputs {
  if (!i) return { ...EMPTY_ITEM };
  return {
    fobUnitPriceUsd: text(i.fobUnitPriceUsd),
    pcsPerCarton: text(i.pcsPerCarton),
    cartonLengthCm: text(i.cartonLengthCm),
    cartonWidthCm: text(i.cartonWidthCm),
    cartonHeightCm: text(i.cartonHeightCm),
    cartonGrossKg: text(i.cartonGrossKg),
  };
}

function scenarioDraft(s: Scenario, workspace: Workspace): ScenarioDraft {
  const items = new Map(s.items.map((i) => [i.skuLineId, i]));
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
    items: Object.fromEntries(workspace.skuLines.map((l) => [l.id, itemInputs(items.get(l.id))])),
    overrides: Object.fromEntries(
      s.items
        .filter((i) => (i.overrides ?? []).length > 0)
        .map((i) => [
          i.skuLineId,
          i.overrides.map((o) => ({
            ref: o.id,
            id: o.id,
            kind: o.kind,
            layerKey: text(o.layerKey),
            label: text(o.label),
            ratePercent: text(o.ratePercent),
            amountUsd: text(o.amountUsd),
            reason: o.reason,
          })),
        ]),
    ),
    otherCosts: s.otherCosts.map((c) => ({ ref: c.id, id: c.id, label: c.label, amountUsd: c.amountUsd })),
  };
}

// Null for a workspace with no scenario: there's nothing to edit.
export function toEditorDraft(workspace: Workspace): EditorDraft | null {
  const baseline = baselineScenario(workspace);
  if (!baseline) return null;
  return {
    name: workspace.name,
    entryDate: workspace.entryDate,
    baselineRef: baseline.id,
    skus: workspace.skuLines.map((l) => ({
      ref: l.id,
      id: l.id,
      skuCode: l.skuCode,
      description: text(l.description),
      htsCode: l.htsCode,
      quantity: l.quantity,
      dutyQuantity: l.dutyQuantity?.value ?? "",
      dutyQuantityUnit: l.dutyQuantity?.unit ?? "",
    })),
    scenarios: workspace.scenarios.map((s) => scenarioDraft(s, workspace)),
  };
}

export function newSkuRow(ref: string): SkuRow {
  return { ref, id: null, skuCode: "", description: "", htsCode: "", quantity: "", dutyQuantity: "", dutyQuantityUnit: "" };
}

export function newCostRow(ref: string): CostRow {
  return { ref, id: null, label: "", amountUsd: "" };
}

// A new SKU row for every origin, with empty inputs.
export function addSkuRow(draft: EditorDraft, ref: string): EditorDraft {
  return {
    ...draft,
    skus: [...draft.skus, newSkuRow(ref)],
    scenarios: draft.scenarios.map((s) => ({ ...s, items: { ...s.items, [ref]: { ...EMPTY_ITEM } } })),
  };
}

export function removeSkuRow(draft: EditorDraft, ref: string): EditorDraft {
  return {
    ...draft,
    skus: draft.skus.filter((s) => s.ref !== ref),
    scenarios: draft.scenarios.map((s) => {
      const items = { ...s.items };
      delete items[ref];
      const overrides = { ...s.overrides };
      delete overrides[ref];
      return { ...s, items, overrides };
    }),
  };
}

// saveDraftAction's input. expectedUpdatedAt is passed through exactly as the
// database returned it. Every origin sends an item for every SKU row, in row
// order, so an error's index is the row's.
export function toSaveInput(draft: EditorDraft, workspaceId: string, expectedUpdatedAt: string) {
  return {
    workspaceId,
    expectedUpdatedAt,
    draft: {
      name: draft.name,
      entryDate: draft.entryDate,
      baselineRef: draft.baselineRef,
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
      scenarios: draft.scenarios.map(({ items, overrides, otherCosts, ...fields }) => ({
        ...fields,
        items: draft.skus.map((s) => ({
          skuRef: s.ref,
          ...(items[s.ref] ?? EMPTY_ITEM),
          overrides: (overrides[s.ref] ?? []).map((o) => ({ ...o })),
        })),
        otherCosts: otherCosts.map((c) => ({ id: c.id, label: c.label, amountUsd: c.amountUsd })),
      })),
    },
  };
}

// After a save: each new SKU row, origin and manual rate takes the id the
// database gave it, which becomes its ref too. (Other costs get theirs when
// the page reloads from the server.)
export function applySaveResult(
  draft: EditorDraft,
  ids: { skuLines: Record<string, string>; scenarios: Record<string, string>; overrides?: Record<string, string> },
): EditorDraft {
  const overrideId = (o: OverrideRow) => ids.overrides?.[o.ref] ?? o.id;
  const skuRef = (ref: string) => ids.skuLines[ref] ?? ref;
  const scenarioRef = (ref: string) => ids.scenarios[ref] ?? ref;
  return {
    ...draft,
    baselineRef: scenarioRef(draft.baselineRef),
    skus: draft.skus.map((s) => {
      const id = ids.skuLines[s.ref] ?? s.id;
      return { ...s, ref: id ?? s.ref, id };
    }),
    scenarios: draft.scenarios.map((s) => {
      const id = ids.scenarios[s.ref] ?? s.id;
      return {
        ...s,
        ref: id ?? s.ref,
        id,
        items: Object.fromEntries(Object.entries(s.items).map(([ref, inputs]) => [skuRef(ref), inputs])),
        overrides: Object.fromEntries(
          Object.entries(s.overrides).map(([ref, rows]) => [
            skuRef(ref),
            rows.map((o) => {
              const id = overrideId(o);
              return { ...o, ref: id ?? o.ref, id };
            }),
          ]),
        ),
      };
    }),
  };
}

export function isDirty(draft: EditorDraft, saved: EditorDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

// ---- Field ids (for labels, focus from the result panel and error links) ----

export type SkuLineInput = Exclude<keyof SkuRow, "ref" | "id">;
export type ItemInput = keyof ItemInputs;
export type ScenarioInput = Exclude<keyof ScenarioFields, "ref" | "id">;

export const workspaceFieldId = (field: "name" | "entryDate") => `lc-${field}`;
export const skuFieldId = (skuRef: string, field: SkuLineInput) => `lc-sku-${skuRef}-${field}`;
export const itemFieldId = (scenarioRef: string, skuRef: string, field: ItemInput) => `lc-item-${scenarioRef}-${skuRef}-${field}`;
export const scenarioFieldId = (scenarioRef: string, field: ScenarioInput) => `lc-scn-${scenarioRef}-${field}`;
export const costFieldId = (ref: string, field: "label" | "amountUsd") => `lc-cost-${ref}-${field}`;

// The field a result's missing input refers to.
export function missingFieldId(scenarioRef: string, skuRef: string, field: SkuField): string {
  return field === "duty_quantity" ? skuFieldId(skuRef, "dutyQuantity") : itemFieldId(scenarioRef, skuRef, ITEM_FIELD_INPUT[field]);
}

const ITEM_FIELD_INPUT: Record<Exclude<SkuField, "duty_quantity">, ItemInput> = {
  fob_unit_price_usd: "fobUnitPriceUsd",
  pcs_per_carton: "pcsPerCarton",
  carton_length_cm: "cartonLengthCm",
  carton_width_cm: "cartonWidthCm",
  carton_height_cm: "cartonHeightCm",
  carton_gross_kg: "cartonGrossKg",
};

const SKU_LINE_INPUTS = new Set<string>(["skuCode", "description", "htsCode", "quantity", "dutyQuantity", "dutyQuantityUnit"]);
const ITEM_INPUTS = new Set<string>(ITEM_INPUT_KEYS);
const SCENARIO_INPUTS = new Set<string>([
  "label", "originCountry", "supplierName", "incoterm", "shipmentMode", "entryType", "freightTotalUsd", "freightBasis", "volumetricDivisor",
]);

// The field an action issue's path (e.g. "scenarios.1.items.2.fobUnitPriceUsd")
// points at, and the origin it's in; null field for the draft as a whole.
export function issueTarget(path: string, draft: EditorDraft): { id: string | null; scenarioRef: string | null } {
  const p = path.split(".");
  const none = { id: null, scenarioRef: null };
  if (p.length === 1 && (p[0] === "name" || p[0] === "entryDate")) return { id: workspaceFieldId(p[0]), scenarioRef: null };
  if (p[0] === "skuLines") {
    const row = draft.skus[Number(p[1])];
    if (!row) return none;
    return { id: skuFieldId(row.ref, SKU_LINE_INPUTS.has(p[2]) ? (p[2] as SkuLineInput) : "skuCode"), scenarioRef: null };
  }
  if (p[0] !== "scenarios") return none;
  const scenario = draft.scenarios[Number(p[1])];
  if (!scenario) return none;
  const at = (id: string | null) => ({ id, scenarioRef: scenario.ref });
  if (p[2] === "items") {
    const row = draft.skus[Number(p[3])];
    if (!row) return at(null);
    return at(itemFieldId(scenario.ref, row.ref, ITEM_INPUTS.has(p[4]) ? (p[4] as ItemInput) : "fobUnitPriceUsd"));
  }
  if (p[2] === "otherCosts") {
    const row = scenario.otherCosts[Number(p[3])];
    return at(row ? costFieldId(row.ref, p[4] === "amountUsd" ? "amountUsd" : "label") : null);
  }
  return at(SCENARIO_INPUTS.has(p[2]) ? scenarioFieldId(scenario.ref, p[2] as ScenarioInput) : scenarioFieldId(scenario.ref, "label"));
}
