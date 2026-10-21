import { EMPTY_ITEM, type EditorDraft, type ScenarioDraft } from "./editor-draft";

// Adding, duplicating, removing and choosing origins in the local draft
// (nothing is saved until "Save draft"). Pure.

export const MAX_ORIGINS = 5;
export const LABEL_MAX = 60;
export const MAX_ORIGINS_REASON = `A workspace can have at most ${MAX_ORIGINS} origins.`;

// A label as the tables check it: trimmed (JavaScript's trim()), 1-60 UTF-16 units.
const clip = (label: string) => label.trim().slice(0, LABEL_MAX).trim();

// The first free label for an origin in `country`: the country's name, else
// "<Country> (<supplier>)", else "<Country> 2", "<Country> 3"…; never one in
// `taken`, never over 60 characters.
export function defaultLabel(countryName: string, supplier: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.trim()));
  const name = clip(countryName);
  const candidates = [name];
  if (supplier.trim()) candidates.push(clip(`${name} (${supplier.trim()})`));
  for (const candidate of candidates) if (candidate && !used.has(candidate)) return candidate;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = `${name.slice(0, LABEL_MAX - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

// Why the label can't be saved, or null. Same rules as the database.
export function labelError(draft: EditorDraft, ref: string): string | null {
  const scenario = draft.scenarios.find((s) => s.ref === ref);
  if (!scenario) return null;
  const label = scenario.label.trim();
  if (label.length < 1 || label.length > LABEL_MAX) return `Enter a label of 1 to ${LABEL_MAX} characters.`;
  if (draft.scenarios.some((s) => s.ref !== ref && s.label.trim() === label)) return `Another origin is already labelled "${label}".`;
  return null;
}

export function canAddOrigin(draft: EditorDraft): boolean {
  return draft.scenarios.length < MAX_ORIGINS;
}

type NewOrigin = { ref: string; countryCode: string; countryName: string };

function withOrigin(draft: EditorDraft, scenario: ScenarioDraft): EditorDraft {
  return canAddOrigin(draft) ? { ...draft, scenarios: [...draft.scenarios, scenario] } : draft;
}

// A copy of `sourceRef` in another country: its mode, incoterm, entry type,
// freight basis, divisor, per-SKU packing and other costs. The FOB prices and
// the freight total start empty, so the new origin shows "inputs missing"
// until they're entered (never the source's prices by mistake); the
// supplier starts blank.
export function duplicateOrigin(draft: EditorDraft, sourceRef: string, origin: NewOrigin, costRef: () => string): EditorDraft {
  const source = draft.scenarios.find((s) => s.ref === sourceRef);
  if (!source) return draft;
  return withOrigin(draft, {
    ref: origin.ref,
    id: null,
    label: defaultLabel(origin.countryName, "", draft.scenarios.map((s) => s.label)),
    originCountry: origin.countryCode,
    supplierName: "",
    incoterm: source.incoterm,
    shipmentMode: source.shipmentMode,
    entryType: source.entryType,
    freightTotalUsd: "",
    freightBasis: source.freightBasis,
    volumetricDivisor: source.volumetricDivisor,
    items: Object.fromEntries(
      draft.skus.map((s) => [s.ref, { ...(source.items[s.ref] ?? EMPTY_ITEM), fobUnitPriceUsd: "" }]),
    ),
    otherCosts: source.otherCosts.map((c) => ({ ...c, ref: costRef(), id: null })),
  });
}

// An empty origin: Sea, FOB, automatic entry, freight by chargeable weight.
export function addBlankOrigin(draft: EditorDraft, origin: NewOrigin): EditorDraft {
  return withOrigin(draft, {
    ref: origin.ref,
    id: null,
    label: defaultLabel(origin.countryName, "", draft.scenarios.map((s) => s.label)),
    originCountry: origin.countryCode,
    supplierName: "",
    incoterm: "FOB",
    shipmentMode: "Sea",
    entryType: "auto",
    freightTotalUsd: "",
    freightBasis: "chargeable_weight",
    volumetricDivisor: "",
    items: Object.fromEntries(draft.skus.map((s) => [s.ref, { ...EMPTY_ITEM }])),
    otherCosts: [],
  });
}

// Removes an origin, never the last. Removing the baseline makes the first
// remaining origin the baseline; `newBaseline` names it so the page can say so.
export function removeOrigin(draft: EditorDraft, ref: string): { draft: EditorDraft; newBaseline: string | null } {
  if (draft.scenarios.length <= 1 || !draft.scenarios.some((s) => s.ref === ref)) return { draft, newBaseline: null };
  const scenarios = draft.scenarios.filter((s) => s.ref !== ref);
  if (draft.baselineRef !== ref) return { draft: { ...draft, scenarios }, newBaseline: null };
  return { draft: { ...draft, scenarios, baselineRef: scenarios[0].ref }, newBaseline: scenarios[0].ref };
}

export function setBaseline(draft: EditorDraft, ref: string): EditorDraft {
  return draft.scenarios.some((s) => s.ref === ref) ? { ...draft, baselineRef: ref } : draft;
}
