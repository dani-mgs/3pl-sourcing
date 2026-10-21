import { z } from "zod";
import { isRealIsoDate } from "@/lib/forwarder/parse-quote-form";
import { SHIPMENT_MODES } from "@/lib/tariff/calculate";
import { isOriginCountry } from "@/lib/tariff/countries";
import { checkEntryDate } from "@/lib/tariff/entry-date";
import { normalizeHtsCode } from "@/lib/tariff/hts-code";
import { positiveDecimal } from "@/lib/tariff/parse-estimate-form";
import { UNIT_TOKENS, normalizeUnit } from "@/lib/tariff/rate-text";
import { fromInteger, mul, parseDecimal, toCents } from "@/lib/tariff/rational";
import { parseAmount, parseCents, parseMeasure, parseWholeNumber } from "./money";
import { MAX_OTHER_COST_LINES } from "./other-costs";
import { FREIGHT_BASES, SUPPORTED_INCOTERMS } from "./scenario-totals";
import { CM_BOUNDS, DIVISOR_BOUNDS, KG_BOUNDS } from "./shipment-measures";

// A Landed Cost draft as the browser sends it (inputs only, every number a
// string), checked and normalised into the payload the database functions
// take (create_landed_cost_workspace, save_landed_cost_draft). Every bound is
// the one the workspace tables enforce, so a draft that passes here is saved;
// the database stays the backstop. Pure.

export const MAX_SKU_LINES = 100;
export const MAX_SCENARIOS = 5;

const ENTERED_VALUE_MAX_CENTS = BigInt(10) ** BigInt(16);

export type DraftIssue = { path: string; message: string };
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string; issues: DraftIssue[] };

// ---- Fields ----

// Trimmed as JavaScript's trim() does, then min..max UTF-16 units (.length):
// the rule the tables check with landed_cost_text_ok.
const text = (min: number, max: number, message: string) =>
  z.string().transform((s) => s.trim()).refine((s) => s.length >= min && s.length <= max, message);
const optionalText = (max: number, message: string) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").trim() || null)
    .refine((s) => s == null || s.length <= max, message);

// Numbers arrive as strings; spaces and thousands commas go, as the loader drops them.
const clean = (s: string) => s.trim().replace(/,/g, "");
const number = (accepts: (s: string) => boolean, message: string) =>
  z.string().transform(clean).refine(accepts, message);
const optionalNumber = (accepts: (s: string) => boolean, message: string) =>
  z
    .string()
    .nullish()
    .transform((s) => clean(s ?? "") || null)
    .refine((s) => s == null || accepts(s), message);

const ref = z.string().min(1).max(100);
const id = z.uuid().nullish().transform((s) => s ?? null);

const hts = z.string().transform((s, ctx) => {
  const code = normalizeHtsCode(s);
  if (!code.ok) {
    ctx.addIssue({ code: "custom", message: code.error });
    return z.NEVER;
  }
  return code.digits;
});
const origin = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .refine(isOriginCountry, "Choose the country of origin.");
const unit = z
  .string()
  .nullish()
  .transform((s) => normalizeUnit(s ?? "") || null)
  .refine((s) => s == null || UNIT_TOKENS.includes(s), "Choose the duty quantity's unit from the list.");

const fob = optionalNumber((s) => parseAmount(s, 4) != null, "Enter the FOB price in USD with up to 4 decimals, e.g. 6.25.")
  .refine((s) => s == null || parseAmount(s, 4) == null || parseDecimal(s).n > BigInt(0), "Enter a FOB price above $0.00.");

const workspaceName = text(1, 120, "Enter a workspace name of 1 to 120 characters.");
const entryDate = z.string().trim().refine(isRealIsoDate, "Enter the expected entry date as a real date.");

// ---- Shapes ----

const scenarioFields = {
  label: text(1, 60, "Enter a scenario label of 1 to 60 characters."),
  originCountry: origin,
  supplierName: optionalText(120, "Enter a supplier name of up to 120 characters."),
  incoterm: z.enum(SUPPORTED_INCOTERMS as [string, ...string[]], "Choose EXW, FCA, FAS or FOB."),
  shipmentMode: z.enum(SHIPMENT_MODES as [string, ...string[]], "Choose the shipment mode."),
  entryType: z.enum(["auto", "formal"], "Choose the entry type."),
  freightTotalUsd: optionalNumber((s) => parseCents(s) != null, "Enter the freight total in USD as 0 or more, e.g. 854.00."),
  freightBasis: z.enum(FREIGHT_BASES, "Choose how freight is split."),
  volumetricDivisor: optionalNumber(
    (s) => parseMeasure(s, DIVISOR_BOUNDS) != null,
    "Enter the divisor above zero and below 1,000,000, with up to 3 decimals, or leave it blank.",
  ),
};

export const skuLineSchema = z
  .object({
    ref,
    id,
    skuCode: text(1, 60, "Enter a SKU code of 1 to 60 characters."),
    description: optionalText(500, "Enter a description of up to 500 characters."),
    htsCode: hts,
    quantity: number((s) => parseWholeNumber(s) != null, "Enter the quantity as a whole number from 1 to 999,999,999,999."),
    dutyQuantity: optionalNumber(
      (s) => positiveDecimal(s, 4, 1e12),
      "Enter the duty quantity above zero with up to 4 decimals.",
    ),
    dutyQuantityUnit: unit,
  })
  .refine((l) => (l.dutyQuantity == null) === (l.dutyQuantityUnit == null), {
    message: "Enter the duty quantity together with its unit, or neither.",
    path: ["dutyQuantity"],
  });

const measure = (bounds: { places: number; max: number }, message: string) =>
  optionalNumber((s) => parseMeasure(s, bounds) != null, message);

export const itemSchema = z.object({
  skuRef: ref,
  fobUnitPriceUsd: fob,
  pcsPerCarton: optionalNumber((s) => parseWholeNumber(s) != null, "Enter the pieces per carton as a whole number above zero."),
  cartonLengthCm: measure(CM_BOUNDS, "Enter the carton length in cm, above zero with up to 2 decimals."),
  cartonWidthCm: measure(CM_BOUNDS, "Enter the carton width in cm, above zero with up to 2 decimals."),
  cartonHeightCm: measure(CM_BOUNDS, "Enter the carton height in cm, above zero with up to 2 decimals."),
  cartonGrossKg: measure(KG_BOUNDS, "Enter the carton weight in kg, above zero with up to 3 decimals."),
});

const otherCostSchema = z.object({
  id,
  label: text(1, 100, "Enter an other cost label of 1 to 100 characters."),
  amountUsd: number((s) => parseCents(s) != null, "Enter the amount in USD as 0 or more, e.g. 150.00."),
});

const scenarioSchema = z.object({
  ref,
  id,
  ...scenarioFields,
  items: z.array(itemSchema).max(MAX_SKU_LINES, `A scenario can have at most ${MAX_SKU_LINES} items.`),
  otherCosts: z
    .array(otherCostSchema)
    .max(MAX_OTHER_COST_LINES, `A scenario can have at most ${MAX_OTHER_COST_LINES} other costs.`),
});

const draftObject = z.object({
  name: workspaceName,
  entryDate,
  baselineRef: ref,
  skuLines: z.array(skuLineSchema).max(MAX_SKU_LINES, `A workspace can have at most ${MAX_SKU_LINES} SKU lines.`),
  scenarios: z
    .array(scenarioSchema)
    .min(1, "A workspace needs at least one scenario.")
    .max(MAX_SCENARIOS, `A workspace can have at most ${MAX_SCENARIOS} scenarios.`),
});

export const draftSchema = draftObject.superRefine((d, ctx) => checkRows(d, ctx));

export type Draft = z.output<typeof draftSchema>;

export const createWorkspaceSchema = z.object({ name: workspaceName, entryDate, scenario: z.object(scenarioFields) });
export type CreateWorkspaceInput = z.output<typeof createWorkspaceSchema>;

// ---- Checks across rows ----

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const v of values) (seen.has(v) ? twice : seen).add(v);
  return twice;
}

function checkRows(d: z.output<typeof draftObject>, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

  const lineRefs = duplicates(d.skuLines.map((l) => l.ref));
  const codes = duplicates(d.skuLines.map((l) => l.skuCode));
  const lineIds = duplicates(d.skuLines.flatMap((l) => (l.id ? [l.id] : [])));
  d.skuLines.forEach((l, i) => {
    if (lineRefs.has(l.ref) || (l.id && lineIds.has(l.id))) issue(["skuLines", i], "This SKU line appears twice. Reload the workspace.");
    if (codes.has(l.skuCode)) issue(["skuLines", i, "skuCode"], `The SKU code "${l.skuCode}" is used more than once.`);
  });

  const scenarioRefs = duplicates(d.scenarios.map((s) => s.ref));
  const labels = duplicates(d.scenarios.map((s) => s.label));
  const scenarioIds = duplicates(d.scenarios.flatMap((s) => (s.id ? [s.id] : [])));
  const costIds = duplicates(d.scenarios.flatMap((s) => s.otherCosts.flatMap((c) => (c.id ? [c.id] : []))));
  const lines = new Map(d.skuLines.map((l) => [l.ref, l]));
  d.scenarios.forEach((s, i) => {
    if (scenarioRefs.has(s.ref) || (s.id && scenarioIds.has(s.id))) issue(["scenarios", i], "This scenario appears twice. Reload the workspace.");
    if (labels.has(s.label)) issue(["scenarios", i, "label"], `The scenario label "${s.label}" is used more than once.`);
    s.otherCosts.forEach((c, j) => {
      if (c.id && costIds.has(c.id)) issue(["scenarios", i, "otherCosts", j], "This other cost appears twice. Reload the workspace.");
    });
    const itemRefs = duplicates(s.items.map((it) => it.skuRef));
    s.items.forEach((it, j) => {
      const line = lines.get(it.skuRef);
      if (!line) return issue(["scenarios", i, "items", j], "This item's SKU line isn't in the workspace. Reload the workspace.");
      if (itemRefs.has(it.skuRef)) issue(["scenarios", i, "items", j], `${line.skuCode} has more than one set of inputs in ${s.label}.`);
      // As the loader receives it: qty x FOB rounded to the cent, in (0, 1e14).
      // Skipped when either is missing or already refused above.
      const quantity = parseWholeNumber(line.quantity);
      const price = it.fobUnitPriceUsd == null ? null : parseAmount(it.fobUnitPriceUsd, 4);
      if (quantity == null || price == null) return;
      const cents = toCents(mul(price, fromInteger(quantity)));
      if (cents <= BigInt(0) || cents >= ENTERED_VALUE_MAX_CENTS) {
        issue(
          ["scenarios", i, "items", j, "fobUnitPriceUsd"],
          `${line.skuCode} in ${s.label}: quantity × FOB price must come to more than $0.00 and less than $100 trillion.`,
        );
      }
    });
  });
  if (!d.scenarios.some((s) => s.ref === d.baselineRef)) issue(["baselineRef"], "Choose the baseline scenario.");
}

// ---- Parsing ----

function issuesOf(error: z.ZodError): DraftIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

function parsed<T>(result: z.ZodSafeParseResult<T>): ParseResult<T> {
  if (result.success) return { ok: true, data: result.data };
  const issues = issuesOf(result.error);
  return { ok: false, error: issues[0]?.message ?? "Check the draft and try again.", issues };
}

export function parseDraft(input: unknown): ParseResult<Draft> {
  return parsed(draftSchema.safeParse(input));
}

// A new workspace's entry date must be in range now; a saved draft's may age
// (the calculation then asks for a new one).
export function parseCreateWorkspace(input: unknown, calculatedOn: string): ParseResult<CreateWorkspaceInput> {
  const result = parsed(createWorkspaceSchema.safeParse(input));
  if (!result.ok) return result;
  const date = checkEntryDate(result.data.entryDate, calculatedOn);
  if (!date.ok) return { ok: false, error: date.error, issues: [{ path: "entryDate", message: date.error }] };
  return result;
}

// ---- Payloads (the database functions' keys; numbers stay strings) ----

type ScenarioFields = z.output<z.ZodObject<typeof scenarioFields>>;

function scenarioPayload(s: ScenarioFields) {
  return {
    label: s.label,
    origin_country: s.originCountry,
    supplier_name: s.supplierName,
    incoterm: s.incoterm,
    shipment_mode: s.shipmentMode,
    entry_type: s.entryType,
    freight_total_usd: s.freightTotalUsd,
    freight_basis: s.freightBasis,
    volumetric_divisor: s.volumetricDivisor,
  };
}

export function createPayload(input: CreateWorkspaceInput) {
  return { name: input.name, entry_date: input.entryDate, scenario: scenarioPayload(input.scenario) };
}

// Rows keep their order as sort_order; a row without an id is inserted.
export function savePayload(draft: Draft) {
  const withId = (rowId: string | null) => (rowId ? { id: rowId } : {});
  return {
    name: draft.name,
    entry_date: draft.entryDate,
    baseline_ref: draft.baselineRef,
    sku_lines: draft.skuLines.map((l, i) => ({
      ref: l.ref,
      ...withId(l.id),
      sku_code: l.skuCode,
      description: l.description,
      hts_code: l.htsCode,
      quantity: l.quantity,
      duty_quantity: l.dutyQuantity,
      duty_quantity_unit: l.dutyQuantityUnit,
      sort_order: i,
    })),
    scenarios: draft.scenarios.map((s, i) => ({
      ref: s.ref,
      ...withId(s.id),
      ...scenarioPayload(s),
      sort_order: i,
      items: s.items.map((it) => ({
        sku_ref: it.skuRef,
        fob_unit_price_usd: it.fobUnitPriceUsd,
        pcs_per_carton: it.pcsPerCarton,
        carton_length_cm: it.cartonLengthCm,
        carton_width_cm: it.cartonWidthCm,
        carton_height_cm: it.cartonHeightCm,
        carton_gross_kg: it.cartonGrossKg,
      })),
      other_costs: s.otherCosts.map((c, j) => ({ ...withId(c.id), label: c.label, amount_usd: c.amountUsd, sort_order: j })),
    })),
  };
}
