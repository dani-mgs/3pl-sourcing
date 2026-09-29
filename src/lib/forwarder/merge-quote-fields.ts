import { mergeScalarField } from "@/lib/merge-fields";
import { isTypeAllowedForMode } from "./project-fields";
import type { QuoteFormDefaults } from "@/app/(authenticated)/forwarder-sourcing/[id]/forwarders/[forwarderId]/quotes/quote-form";

// Everything the extraction tool can populate. quote_completeness,
// overall_assessment, and client_decision are deliberately absent — those are
// the user's own judgment calls about the quote, never a fact a rate-sheet
// email states about itself (mirrors 4A/4B excluding internal-tracking
// fields). exchange_rate_to_usd is included but is handled specially: see
// extract-actions.ts's USD short-circuit and quote-form.tsx's manual-entry
// warning, not this merge function — a genuinely missing rate must reach the
// form as null, never a guessed number, so no special-casing belongs here
// beyond the plain scalar comparison every other field gets.
export type ExtractedQuoteFields = Omit<
  QuoteFormDefaults,
  "quote_completeness" | "overall_assessment" | "client_decision"
>;

const SCALAR_FIELDS = [
  "origin",
  "destination",
  "incoterm",
  "actual_weight_kg",
  "chargeable_weight_kg",
  "cbm",
  "cost_of_goods_usd",
  "original_currency",
  "original_amount",
  "exchange_rate_to_usd",
  "duties_taxes_usd",
  "other_charges_usd",
  "other_charges_description",
  "lead_time_min_days",
  "lead_time_max_days",
  "quote_date",
  "rate_valid_until",
  "quote_reference",
  "key_strength",
  "key_weakness_risk",
  "important_assumption",
  "notes",
] as const satisfies readonly (keyof ExtractedQuoteFields)[];

// Every field the extraction tool can populate, for building merge-mode's
// "current values" prompt context.
export const EXTRACTABLE_FIELD_KEYS: (keyof ExtractedQuoteFields)[] = [
  ...SCALAR_FIELDS,
  "scenario_group",
  "shipment_mode",
  "shipment_type",
];

export type QuoteMergeResult = {
  merged: QuoteFormDefaults;
  changed: Set<string>;
};

// Update-from-document merge for an existing quote: only overwrites a field
// when the document clearly stated a new value for it — anything not
// mentioned keeps the quote's existing value. shipment_mode/shipment_type are
// merged individually and then re-validated together, same resolution as
// 4A/4B: if the merged pair no longer fits, the mode is kept and the type is
// cleared and flagged "changed" rather than the extraction being rejected.
export function mergeQuoteFields(
  current: QuoteFormDefaults,
  extracted: ExtractedQuoteFields,
): QuoteMergeResult {
  const merged: QuoteFormDefaults = { ...current };
  const changed = new Set<string>();

  for (const key of SCALAR_FIELDS) {
    mergeScalarField(current, extracted, key, merged, changed);
  }
  mergeScalarField(current, extracted, "scenario_group", merged, changed);
  mergeScalarField(current, extracted, "shipment_mode", merged, changed);
  mergeScalarField(current, extracted, "shipment_type", merged, changed);

  if (
    merged.shipment_type != null &&
    !isTypeAllowedForMode(merged.shipment_mode ?? null, merged.shipment_type ?? null)
  ) {
    merged.shipment_type = null;
    changed.add("shipment_type");
  }

  return { merged, changed };
}
