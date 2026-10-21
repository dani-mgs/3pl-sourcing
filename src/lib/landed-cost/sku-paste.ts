import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { formatHtsCode, normalizeHtsCode } from "@/lib/tariff/hts-code";
import { EMPTY_ITEM, MAX_EDITOR_SKUS, addSkuRow, newSkuRow, type EditorDraft, type ItemInputs, type SkuRow } from "./editor-draft";
import { itemSchema, skuLineSchema } from "./parse-draft";
import { PASTE_FIELD_LABELS, type IgnoredColumn, type ParsedPaste, type PasteField } from "./parse-sku-paste";

// Pasted rows checked against the draft before anything changes: each one
// updates the SKU with the same code, adds a new one, or has errors (the
// messages saving gives). Applying edits the local draft only: SKU,
// description, HTS and quantity on the shared rows, FOB price and packing on
// the chosen origin. A blank cell leaves the value as it is; nothing is
// deleted. Pure.

type SkuField = "skuCode" | "description" | "htsCode" | "quantity";
type ItemField = keyof ItemInputs;
const SKU_FIELDS: SkuField[] = ["skuCode", "description", "htsCode", "quantity"];
const ITEM_FIELDS: ItemField[] = ["fobUnitPriceUsd", "pcsPerCarton", "cartonLengthCm", "cartonWidthCm", "cartonHeightCm", "cartonGrossKg"];
const NUMERIC = new Set<PasteField>(["quantity", ...ITEM_FIELDS]);

export type PreviewRow = {
  rowNumber: number;
  action: "update" | "add" | "error";
  skuCode: string;
  // The pasted values as they'll land; "" leaves the value as it is.
  values: Record<PasteField, string>;
  errors: string[];
  warnings: string[];
  // A new SKU's blanks that saving will ask for.
  stillNeeded: string[];
};

export type PastePreview = {
  originRef: string;
  originLabel: string;
  columns: { heading: string; field: PasteField }[];
  ignored: IgnoredColumn[];
  rows: PreviewRow[];
  updates: number;
  adds: number;
  errorRows: number;
  // Set when the new SKUs would pass the limit: nothing can be applied.
  limitError: string | null;
};

// "$1,053.00" → "1053.00": the dollar sign, spaces and thousands commas go.
export const cleanNumber = (s: string) => s.replace(/[$\s,]/g, "");

function landed(field: PasteField, raw: string): string {
  if (raw === "") return "";
  if (NUMERIC.has(field)) return cleanNumber(raw);
  if (field === "htsCode") {
    const code = normalizeHtsCode(raw);
    return code.ok ? formatHtsCode(code.digits) : raw;
  }
  return raw;
}

// Longest names first, so "South Korea" wins over "Korea".
const COUNTRY_WORDS = [...ORIGIN_COUNTRIES.flatMap((c) => [c.name, c.code])].sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COUNTRY_SUFFIX = new RegExp(`[\\s_/–—-]+(${COUNTRY_WORDS.map(escape).join("|")})$`, "i");

// "SKU-001 - VIETNAM" → "VIETNAM", as typed.
export function countryInCode(code: string): string | null {
  const match = COUNTRY_SUFFIX.exec(code);
  return match && match.index > 0 ? match[1] : null;
}

// Only the fields the paste gave: issues about values already in the draft aren't the paste's.
function issuesFor(result: { success: true } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }, given: Set<string>): string[] {
  if (result.success) return [];
  const messages = result.error.issues.filter((i) => given.has(String(i.path[0]))).map((i) => i.message);
  return [...new Set(messages)];
}

export function previewSkuPaste(draft: EditorDraft, originRef: string, parsed: Extract<ParsedPaste, { ok: true }>): PastePreview {
  const origin = draft.scenarios.find((s) => s.ref === originRef) ?? draft.scenarios[0];
  const byCode = new Map(draft.skus.map((s) => [s.skuCode.trim(), s]));
  const byLowerCode = new Map(draft.skus.map((s) => [s.skuCode.trim().toLowerCase(), s.skuCode.trim()]));
  const codeCounts = new Map<string, number>();
  for (const r of parsed.rows) {
    const code = r.values.skuCode ?? "";
    if (code) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }

  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const values = Object.fromEntries(
      (Object.keys(PASTE_FIELD_LABELS) as PasteField[]).map((f) => [f, landed(f, r.values[f] ?? "")]),
    ) as Record<PasteField, string>;
    const given = new Set((Object.keys(values) as PasteField[]).filter((f) => values[f] !== ""));
    const code = values.skuCode;
    const existing = byCode.get(code) ?? null;
    const errors: string[] = [];
    const warnings: string[] = [];
    const stillNeeded: string[] = [];

    if (code === "") errors.push("Enter a SKU code of 1 to 60 characters.");
    if ((codeCounts.get(code) ?? 0) > 1) errors.push(`The SKU code "${code}" appears more than once in this paste.`);

    // The row as it would be saved: the draft's values with the pasted ones on top.
    const base: SkuRow = existing ?? newSkuRow("paste");
    const sku = { ...base, ...Object.fromEntries(SKU_FIELDS.filter((f) => given.has(f)).map((f) => [f, values[f]])) };
    errors.push(...issuesFor(skuLineSchema.safeParse({ ...sku, ref: "paste", id: null }), given));
    const item = { ...(existing ? (origin.items[existing.ref] ?? EMPTY_ITEM) : EMPTY_ITEM) };
    for (const f of ITEM_FIELDS) if (given.has(f)) item[f] = values[f];
    errors.push(...issuesFor(itemSchema.safeParse({ ...item, skuRef: "paste" }), given));

    if (!existing && code !== "") {
      if (!given.has("htsCode")) stillNeeded.push(PASTE_FIELD_LABELS.htsCode);
      if (!given.has("quantity")) stillNeeded.push(PASTE_FIELD_LABELS.quantity);
      const sameButCase = byLowerCode.get(code.toLowerCase());
      if (sameButCase) warnings.push(`Differs only by case from ${sameButCase}; it will be added as a new SKU.`);
    }
    const country = countryInCode(code);
    if (country) {
      warnings.push(`This SKU code seems to include a country (${country}). Consider removing it so the same SKU matches across origins.`);
    }

    return {
      rowNumber: r.rowNumber,
      action: errors.length > 0 ? "error" : existing ? "update" : "add",
      skuCode: code,
      values,
      errors: [...new Set(errors)],
      warnings,
      stillNeeded,
    };
  });

  const adds = rows.filter((r) => r.action === "add").length;
  const total = draft.skus.length + adds;
  return {
    originRef: origin.ref,
    originLabel: origin.label,
    columns: parsed.columns,
    ignored: parsed.ignored,
    rows,
    updates: rows.filter((r) => r.action === "update").length,
    adds,
    errorRows: rows.filter((r) => r.action === "error").length,
    limitError:
      total > MAX_EDITOR_SKUS
        ? `This would make ${total} SKUs; a workspace can have at most ${MAX_EDITOR_SKUS}. Remove ${total - MAX_EDITOR_SKUS} new ${total - MAX_EDITOR_SKUS === 1 ? "row" : "rows"} or delete SKUs first.`
        : null,
  };
}

// The rows without errors, into the draft. Rows with errors are left out
// (the dialog only offers this as "Apply valid rows" when there are some).
export function applySkuPaste(draft: EditorDraft, preview: PastePreview, newRef: () => string): { draft: EditorDraft; updated: number; added: number } {
  if (preview.limitError) return { draft, updated: 0, added: 0 };
  let next = draft;
  let updated = 0;
  let added = 0;
  for (const row of preview.rows) {
    if (row.action === "error") continue;
    let ref = next.skus.find((s) => s.skuCode.trim() === row.skuCode)?.ref;
    if (row.action === "add" || !ref) {
      ref = newRef();
      next = addSkuRow(next, ref);
      added++;
    } else updated++;
    const skuRef = ref;
    const skuChange = Object.fromEntries(SKU_FIELDS.filter((f) => row.values[f] !== "").map((f) => [f, row.values[f]]));
    const itemChange = Object.fromEntries(ITEM_FIELDS.filter((f) => row.values[f] !== "").map((f) => [f, row.values[f]]));
    next = {
      ...next,
      skus: next.skus.map((s) => (s.ref === skuRef ? { ...s, ...skuChange } : s)),
      scenarios: next.scenarios.map((s) =>
        s.ref === preview.originRef ? { ...s, items: { ...s.items, [skuRef]: { ...(s.items[skuRef] ?? EMPTY_ITEM), ...itemChange } } } : s,
      ),
    };
  }
  return { draft: next, updated, added };
}

// "Pasted 12 rows into China (8 updated, 4 added). Save draft to keep them."
export function pasteNotice(originLabel: string, updated: number, added: number): string {
  const n = updated + added;
  return `Pasted ${n} ${n === 1 ? "row" : "rows"} into ${originLabel} (${updated} updated, ${added} added). Save draft to keep them.`;
}
