import { pctText, usd } from "@/lib/tariff/amount-text";
import { centsToRational, fromInteger, mul, parseDecimal, toCents, toFixed } from "@/lib/tariff/rational";
import type { EditorDraft, OverrideRow } from "./editor-draft";
import { BASE_LAYER, overrideCents } from "./manual-rates";
import { parseAmount, parseWholeNumber } from "./money";
import { MAX_OVERRIDES_PER_ITEM, overrideSchema } from "./parse-draft";
import type { ResultView, SkuResultRow } from "./result-view";

// The manual-rate editor's logic, kept out of the components: the dialog's
// state to a draft row and back, its validation (parse-draft's own schema,
// plus the per-SKU rules saving checks), the amount preview (the server's
// rounding), the conflict conversions, and the per-origin list. Edits change
// the local draft only; nothing is saved until "Save draft". Pure.

export type ValueType = "rate" | "amount";

export type ManualRateDialog = {
  scenarioRef: string;
  skuRef: string;
  // The draft row being edited (its ref), or a new one.
  ref: string;
  id: string | null;
  kind: "replace" | "add";
  // "base" or a program key; "" for a free-labelled duty.
  layerKey: string;
  // What it's for: the layer replaced, or the program (fixed); free duties edit `label`.
  layerName: string;
  label: string;
  valueType: ValueType;
  value: string;
  reason: string;
  // Replace: the app's own rate and amount, worded ("+25% ($150.00)").
  appRate: string | null;
  confirmAppRate?: boolean;
};

export type DialogField = "label" | "value" | "reason" | "form";
export type DialogErrors = Partial<Record<DialogField, string>>;

export const REASON_MAX = 500;
export const PREVIEW_NOTE = "Preview. The result updates after Save draft.";
export const NO_FOB_PREVIEW = "Enter the FOB price to see a preview.";

const rowsOf = (draft: EditorDraft, scenarioRef: string, skuRef: string) =>
  draft.scenarios.find((s) => s.ref === scenarioRef)?.overrides[skuRef] ?? [];

// ---- Dialog state <-> draft row ----

export function overrideDialog(input: {
  scenarioRef: string;
  skuRef: string;
  ref: string;
  kind: "replace" | "add";
  layerKey: string | null;
  layerName: string;
  appRate?: string | null;
}): ManualRateDialog {
  return {
    scenarioRef: input.scenarioRef,
    skuRef: input.skuRef,
    ref: input.ref,
    id: null,
    kind: input.kind,
    layerKey: input.layerKey ?? "",
    layerName: input.layerName,
    // A program's add is labelled with its name; a free duty starts empty.
    label: input.kind === "add" && input.layerKey ? input.layerName : "",
    valueType: "rate",
    value: "",
    reason: "",
    appRate: input.appRate ?? null,
  };
}

export function dialogFromRow(
  row: OverrideRow,
  at: { scenarioRef: string; skuRef: string; layerName: string; appRate: string | null },
): ManualRateDialog {
  return {
    ...at,
    ref: row.ref,
    id: row.id,
    kind: row.kind,
    layerKey: row.layerKey,
    label: row.kind === "add" ? row.label : "",
    valueType: row.ratePercent.trim() !== "" ? "rate" : "amount",
    value: row.ratePercent.trim() !== "" ? row.ratePercent : row.amountUsd,
    reason: row.reason,
    ...(row.confirmAppRate ? { confirmAppRate: true } : {}),
  };
}

export function rowFromDialog(d: ManualRateDialog): OverrideRow {
  return {
    ref: d.ref,
    id: d.id,
    kind: d.kind,
    layerKey: d.layerKey,
    label: d.kind === "add" ? d.label : "",
    ratePercent: d.valueType === "rate" ? d.value : "",
    amountUsd: d.valueType === "amount" ? d.value : "",
    reason: d.reason,
    ...(d.confirmAppRate ? { confirmAppRate: true } : {}),
  };
}

// ---- Validation: exactly what saving would refuse ----

const FIELD_OF: Record<string, DialogField> = { ratePercent: "value", amountUsd: "value", label: "label", reason: "reason" };

export function validateDialog(d: ManualRateDialog, draft: EditorDraft): DialogErrors {
  const errors: DialogErrors = {};
  const parsed = overrideSchema.safeParse(rowFromDialog(d));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = FIELD_OF[String(issue.path[0])] ?? "form";
      errors[field] ??= issue.message;
    }
  }
  const others = rowsOf(draft, d.scenarioRef, d.skuRef).filter((o) => o.ref !== d.ref);
  if (others.length >= MAX_OVERRIDES_PER_ITEM) errors.form ??= `A SKU can have at most ${MAX_OVERRIDES_PER_ITEM} manual rates in an origin.`;
  const key = d.layerKey.trim();
  if (key !== "" && others.some((o) => o.layerKey.trim() === key)) errors.form ??= "This duty layer already has a manual rate.";
  return errors;
}

// ---- Preview, with the server's rounding ----

// The line's entered value as the server computes it: qty x FOB, to the cent.
export function enteredValue(draft: EditorDraft, scenarioRef: string, skuRef: string): string | null {
  const sku = draft.skus.find((s) => s.ref === skuRef);
  const fob = draft.scenarios.find((s) => s.ref === scenarioRef)?.items[skuRef]?.fobUnitPriceUsd ?? "";
  const quantity = sku ? parseWholeNumber(sku.quantity.replace(/,/g, "")) : null;
  const price = parseAmount(fob, 4);
  if (quantity == null || price == null) return null;
  return toFixed(centsToRational(toCents(mul(price, fromInteger(quantity)))), 2);
}

export type Preview = { kind: "amount"; text: string } | { kind: "no_fob"; text: string } | { kind: "none" };

export function previewOf(d: ManualRateDialog, draft: EditorDraft): Preview {
  const parsed = overrideSchema.safeParse(rowFromDialog({ ...d, reason: d.reason.trim() || "x", label: d.label.trim() || "x" }));
  if (!parsed.success || (parsed.data.ratePercent == null && parsed.data.amountUsd == null)) return { kind: "none" };
  if (parsed.data.amountUsd != null) return { kind: "amount", text: usd(parseDecimal(parsed.data.amountUsd)) };
  const value = enteredValue(draft, d.scenarioRef, d.skuRef);
  if (value == null) return { kind: "no_fob", text: NO_FOB_PREVIEW };
  return { kind: "amount", text: usd(centsToRational(overrideCents(parsed.data, value))) };
}

// ---- Draft edits ----

function withRows(draft: EditorDraft, scenarioRef: string, skuRef: string, change: (rows: OverrideRow[]) => OverrideRow[]): EditorDraft {
  return {
    ...draft,
    scenarios: draft.scenarios.map((s) => {
      if (s.ref !== scenarioRef) return s;
      const rows = change(s.overrides[skuRef] ?? []);
      const overrides = { ...s.overrides };
      if (rows.length > 0) overrides[skuRef] = rows;
      else delete overrides[skuRef];
      return { ...s, overrides };
    }),
  };
}

export function upsertOverride(draft: EditorDraft, d: ManualRateDialog): EditorDraft {
  const row = rowFromDialog(d);
  return withRows(draft, d.scenarioRef, d.skuRef, (rows) =>
    rows.some((o) => o.ref === row.ref) ? rows.map((o) => (o.ref === row.ref ? row : o)) : [...rows, row],
  );
}

export function removeOverride(draft: EditorDraft, scenarioRef: string, skuRef: string, ref: string): EditorDraft {
  return withRows(draft, scenarioRef, skuRef, (rows) => rows.filter((o) => o.ref !== ref));
}

// "Keep my rate" after the app's rate changed: saved with the app's current rate.
export function keepMyRate(draft: EditorDraft, scenarioRef: string, skuRef: string, ref: string): EditorDraft {
  return withRows(draft, scenarioRef, skuRef, (rows) => rows.map((o) => (o.ref === ref ? { ...o, confirmAppRate: true } : o)));
}

// The draft row a saved manual rate (by id) or an unsaved one (by ref) is.
export function findOverride(draft: EditorDraft, scenarioRef: string, idOrRef: string): { skuRef: string; row: OverrideRow } | null {
  const scenario = draft.scenarios.find((s) => s.ref === scenarioRef);
  for (const [skuRef, rows] of Object.entries(scenario?.overrides ?? {})) {
    const row = rows.find((o) => o.id === idOrRef || o.ref === idOrRef);
    if (row) return { skuRef, row };
  }
  return null;
}

// ---- Conflict conversions (the dialog opens on the result, to check before applying) ----

// A replace whose layer the app no longer applies, kept as a manual duty: the
// same value and reason, labelled with the old layer. A program keeps its key,
// so if the app applies it again that's flagged; the base duty has none.
export function asManualDuty(d: ManualRateDialog): ManualRateDialog {
  return { ...d, kind: "add", layerKey: d.layerKey === BASE_LAYER ? "" : d.layerKey, label: d.layerName.slice(0, 100), appRate: null };
}

// An add for a program the app now applies, kept as an override of that layer.
export function asOverride(d: ManualRateDialog, appRate: string | null): ManualRateDialog {
  return { ...d, kind: "replace", label: "", appRate };
}

// ---- The per-origin list ----

export type ManualRateListRow = {
  ref: string;
  skuRef: string;
  skuCode: string;
  layer: string;
  value: string;
  reason: string;
  // "Set by Dani on Oct 1, 2026", once saved.
  setBy: string | null;
  status: string;
  unsaved: boolean;
  // A blocking conflict or the app-rate note, for its actions.
  conflict: "no_longer_matches" | "now_applied" | null;
  note: string | null;
};

export const valueText = (row: Pick<OverrideRow, "ratePercent" | "amountUsd">): string => {
  const rate = parseAmount(row.ratePercent, 4);
  if (row.ratePercent.trim() !== "" && rate) return pctText(rate);
  const amount = parseAmount(row.amountUsd, 2);
  return amount ? `${usd(amount)} fixed` : "—";
};

const same = (a: OverrideRow, b: OverrideRow) =>
  a.kind === b.kind && a.layerKey === b.layerKey && a.label === b.label && a.ratePercent === b.ratePercent &&
  a.amountUsd === b.amountUsd && a.reason === b.reason && !a.confirmAppRate;

// Not saved yet: new, or different from the last save.
export function isUnsaved(row: OverrideRow, saved: EditorDraft, scenarioRef: string, skuRef: string): boolean {
  const before = row.id ? rowsOf(saved, scenarioRef, skuRef).find((o) => o.id === row.id) : undefined;
  return !before || !same(row, before);
}

export function manualRateList(draft: EditorDraft, saved: EditorDraft, scenarioRef: string, view: ResultView | null): ManualRateListRow[] {
  const scenario = draft.scenarios.find((s) => s.ref === scenarioRef);
  if (!scenario) return [];
  const skus: SkuResultRow[] = view && "skus" in view ? view.skus : [];
  return draft.skus.flatMap((sku) =>
    (scenario.overrides[sku.ref] ?? []).map((row): ManualRateListRow => {
      const result = skus.find((s) => s.skuLineId === sku.ref);
      const layer = row.id ? result?.layers.find((l) => l.manual?.overrideId === row.id) : undefined;
      const conflict = row.id ? result?.conflicts.find((c) => c.overrideId === row.id) : undefined;
      const unsaved = isUnsaved(row, saved, scenarioRef, sku.ref);
      const name =
        row.kind === "add" ? row.label : (layer?.manual?.layerName ?? conflict?.layerName ?? (row.layerKey === BASE_LAYER ? "Base duty" : row.layerKey));
      return {
        ref: row.ref,
        skuRef: sku.ref,
        skuCode: sku.skuCode,
        layer: name,
        value: valueText(row),
        reason: row.reason,
        setBy: layer?.manual?.setBy ?? null,
        status: unsaved
          ? "Not saved yet"
          : conflict
            ? conflict.code === "no_longer_matches" ? "Doesn't match a duty layer" : "Now applied by the app"
            : layer?.manual?.note ? "App rate changed" : layer ? "Applied" : "Applied after the next save",
        unsaved,
        conflict: !unsaved && conflict ? conflict.code : null,
        note: !unsaved ? (layer?.manual?.note ?? null) : null,
      };
    }),
  );
}

export function manualRateCount(draft: EditorDraft, scenarioRef: string): number {
  const scenario = draft.scenarios.find((s) => s.ref === scenarioRef);
  return Object.values(scenario?.overrides ?? {}).reduce((n, rows) => n + rows.length, 0);
}
