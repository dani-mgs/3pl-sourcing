import { z } from "zod";
import {
  CURRENCIES,
  INCOTERMS,
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
  isTypeAllowedForMode,
} from "./project-fields";
import {
  CLIENT_DECISION_OPTIONS,
  OVERALL_ASSESSMENT_OPTIONS,
  QUOTE_COMPLETENESS_OPTIONS,
} from "./quote-fields";
import { RATE_SOURCES } from "@/lib/fx/rate-provenance";

// Turns the add/edit quote form into a validated `forwarder_quotes` row
// (everything except forwarder_id, which the action sets). Field names in
// the form are the column names.

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const text = (max = 2000) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

const requiredText = (max = 500) =>
  z.preprocess(blankToNull, z.string().max(max)).pipe(z.string().min(1));

// Native <input type="date"> posts "" or "YYYY-MM-DD". Anything else, or a
// date that doesn't exist (2026-02-30), is refused here with a friendly
// message rather than left for the database to reject.
export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const date = z.preprocess(blankToNull, z.string().refine(isRealIsoDate).nullable());

const DATE_FIELD_LABELS: Record<string, string> = {
  quote_date: "Quote date",
  rate_valid_until: "Rate valid until",
  exchange_rate_date: "Exchange rate date",
};

const option = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToNull, z.enum(values).nullable());

// Upper bounds follow each column's numeric(precision, scale), so a value the
// database would reject is caught here with a friendly message instead.
const decimal = (below: number) =>
  z.preprocess(
    (value) => {
      const v = blankToNull(value);
      return v == null ? null : Number(v);
    },
    z.number().min(0).lt(below).nullable(),
  );

const quoteSchema = z.object({
  scenario_group: requiredText(300),
  shipment_mode: option(SHIPMENT_MODES),
  shipment_type: option(SHIPMENT_TYPES),
  origin: text(200),
  destination: text(200),
  incoterm: option(INCOTERMS),

  actual_weight_kg: decimal(1e11), // numeric(14,3)
  chargeable_weight_kg: decimal(1e11), // numeric(14,3)
  cbm: decimal(1e8), // numeric(14,6)
  cost_of_goods_usd: decimal(1e12), // numeric(14,2)

  original_currency: z.preprocess(
    (value) => blankToNull(value) ?? "USD",
    z.enum(CURRENCIES),
  ),
  original_amount: decimal(1e14), // numeric(16,2)
  // Not null, defaults to 1; a zero or blank rate would zero out every
  // downstream cost, so it's required and must be positive.
  exchange_rate_to_usd: z.preprocess(
    (value) => {
      const v = blankToNull(value);
      return v == null ? 1 : Number(v);
    },
    z.number().gt(0).lt(1e10), // numeric(20,10)
  ),
  // Where the rate came from and its date. Only a claim here: the save
  // actions re-check it (withVerifiedRateProvenance) before storing.
  exchange_rate_source: option(RATE_SOURCES),
  exchange_rate_date: date,

  duties_taxes_usd: decimal(1e12), // numeric(14,2)
  other_charges_usd: decimal(1e12), // numeric(14,2)
  other_charges_description: text(),

  lead_time_min_days: decimal(1e5), // numeric(6,1)
  lead_time_max_days: decimal(1e5), // numeric(6,1)

  quote_completeness: option(QUOTE_COMPLETENESS_OPTIONS),

  quote_date: date,
  rate_valid_until: date,
  quote_reference: text(200),

  key_strength: text(),
  key_weakness_risk: text(),
  important_assumption: text(),
  overall_assessment: option(OVERALL_ASSESSMENT_OPTIONS),
  client_decision: option(CLIENT_DECISION_OPTIONS),
  notes: text(),
});

export type QuoteFields = z.infer<typeof quoteSchema>;

const FIELD_NAMES = Object.keys(quoteSchema.shape) as (keyof QuoteFields)[];

// Every column the add/edit form edits, as a Supabase select list.
export const QUOTE_FIELDS_SELECT = FIELD_NAMES.join(", ");

export type ParseQuoteResult =
  | { ok: true; data: QuoteFields }
  | { ok: false; error: string };

export function parseQuoteForm(formData: FormData): ParseQuoteResult {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }

  // A non-USD quote needs a rate the user actually entered: the schema's
  // blank → 1 default is only right for USD, and a non-USD amount at rate 1
  // would silently skew freight cost, ranking, and savings. Checked on the raw
  // value so a deliberately entered rate of 1 is still accepted.
  const currency = blankToNull(raw.original_currency) ?? "USD";
  if (currency !== "USD" && blankToNull(raw.exchange_rate_to_usd) == null) {
    return {
      ok: false,
      error: `Enter an exchange rate to USD for this ${currency} quote.`,
    };
  }

  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    console.error("parseQuoteForm validation failed:", parsed.error.issues);
    if (parsed.error.issues.some((issue) => issue.path[0] === "scenario_group")) {
      return { ok: false, error: "Scenario group is required." };
    }
    const badDate = parsed.error.issues.find((issue) => String(issue.path[0]) in DATE_FIELD_LABELS);
    if (badDate) {
      return {
        ok: false,
        error: `${DATE_FIELD_LABELS[String(badDate.path[0])]} isn't a valid date. Use the date picker, or enter it as YYYY-MM-DD.`,
      };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  const data = parsed.data;
  if (!isTypeAllowedForMode(data.shipment_mode, data.shipment_type)) {
    return {
      ok: false,
      error: "The shipment type doesn't match the shipment mode.",
    };
  }

  return { ok: true, data };
}
