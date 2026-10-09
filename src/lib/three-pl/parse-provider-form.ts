import { z } from "zod";
import { RATE_FIELDS, type RateDetails, type RateField } from "@/lib/rate-details";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { ASSESSMENT_OPTIONS, STATUS_OPTIONS } from "./three-pl-fields";
import { emailSaveError } from "@/lib/email";

// Turns the add/edit/quick-add 3PL provider form into a validated
// three_pl_providers row plus its 1:1 rate_details row. Field names in the
// form are the column names (website/phone are derived from raw form inputs
// before validation — see buildProviderRaw below).

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const text = (max = 2000) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

const requiredText = (max = 500) =>
  z.preprocess(blankToNull, z.string().max(max)).pipe(z.string().min(1));

const option = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToNull, z.enum(values).nullable());

const bool = z.preprocess((value) => value === "true", z.boolean());

// All 12 money-ish columns here are numeric(12,2): 12 total digits, 2 after
// the decimal, so the largest value Postgres accepts is 9999999999.99 — not
// 1e10, which is one cent past what the column can hold.
const NUMERIC_12_2_MAX = 9999999999.99;
const decimal12_2 = z.preprocess(
  (value) => {
    const v = blankToNull(value);
    return v == null ? null : Number(v);
  },
  z.number().min(0).max(NUMERIC_12_2_MAX).nullable(),
);

const INT_MAX = 2_147_483_647;
const integer = z.preprocess(
  (value) => {
    const v = blankToNull(value);
    return v == null ? null : Number(v);
  },
  z.number().int().min(0).max(INT_MAX).nullable(),
);

const providerSchema = z.object({
  company_name: requiredText(200),
  provider_type: text(200),
  website: text(500),
  location: text(500),
  footprint_source: text(500),
  contact_person: text(200),
  email: text(320),
  phone: text(50),

  receiving: bool,
  storage: bool,
  fulfillment: bool,
  dispatch: bool,
  adhoc_kitting_bundling: bool,
  adhoc_labelling: bool,
  returns: bool,
  annual_inventory_count: bool,
  cycle_count: bool,
  inventory_count_on_request: bool,
  one_time_system_setup: bool,
  lot_batch_expiry_tracking: bool,
  temp_controlled_storage: bool,
  retail_edi_compliance: bool,
  cross_docking: bool,
  b2b: bool,
  b2c: bool,
  is_incumbent: bool,

  onboarding_period_months: integer,
  virtual_tour_url: text(500),
  billing_terms: text(500),
  other_specialization: text(500),

  currency: z.preprocess((value) => blankToNull(value) ?? "USD", z.enum(CURRENCY_OPTIONS)),
  storage_cost: decimal12_2,
  pick_pack_cost: decimal12_2,
  receiving_cost: decimal12_2,
  returns_cost: decimal12_2,
  system_setup_cost: decimal12_2,
  inventory_on_request_cost: decimal12_2,
  adhoc_bundling_kitting_cost: decimal12_2,
  adhoc_labelling_cost: decimal12_2,
  b2b_pick_pack_cost: decimal12_2,

  status: z.preprocess(
    (value) => blankToNull(value) ?? "Potential / Not Contacted",
    z.enum(STATUS_OPTIONS),
  ),
  assessment_status: option(ASSESSMENT_OPTIONS),
  key_strength: text(2000),
  key_weakness_risk: text(2000),
  important_assumption: text(2000),
  overall_assessment: text(2000),
  client_decision: text(500),
  source_basis: text(500),
  next_action: text(500),
  key_notes: text(2000),
  notes: text(2000),
});

export type ProviderFields = z.infer<typeof providerSchema>;

const FIELD_NAMES = Object.keys(providerSchema.shape) as (keyof ProviderFields)[];

// Every column the add/edit/quick-add form edits, as a Supabase select list.
export const PROVIDER_FIELDS_SELECT = FIELD_NAMES.join(", ");

const rateSchema = z.object(
  Object.fromEntries(RATE_FIELDS.map((field) => [field.name, decimal12_2])) as Record<
    RateField,
    typeof decimal12_2
  >,
);

export type ParseProviderResult =
  | { ok: true; data: ProviderFields; rates: RateDetails }
  | { ok: false; error: string };

// Derives the normalized `website` (https-prepended) and `phone` (country
// code + number, concatenated) fields the schema validates, from the raw
// form inputs that back them.
function buildProviderRaw(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }

  const websiteInput = formData.get("website") as string | null;
  raw.website =
    websiteInput && !/^https?:\/\//i.test(websiteInput)
      ? `https://${websiteInput}`
      : websiteInput || null;

  const phoneCountry = (formData.get("phone_country") as string) || "+1";
  const phoneNumber = (formData.get("phone_number") as string) || "";
  raw.phone = phoneNumber ? `${phoneCountry} ${phoneNumber}` : null;

  return raw;
}

// previousEmail: the stored email when editing, so an unchanged one is never
// blocked (emailSaveError).
export function parseProviderForm(
  formData: FormData,
  options: { previousEmail?: string | null } = {},
): ParseProviderResult {
  const raw = buildProviderRaw(formData);
  const parsedProvider = providerSchema.safeParse(raw);

  const rawRates: Record<string, unknown> = {};
  for (const field of RATE_FIELDS) {
    rawRates[field.name] = formData.get(field.name);
  }
  const parsedRates = rateSchema.safeParse(rawRates);

  if (!parsedProvider.success || !parsedRates.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    if (!parsedProvider.success) {
      console.error("parseProviderForm validation failed:", parsedProvider.error.issues);
    }
    if (!parsedRates.success) {
      console.error("parseProviderForm rate validation failed:", parsedRates.error.issues);
    }
    if (
      !parsedProvider.success &&
      parsedProvider.error.issues.some((issue) => issue.path[0] === "company_name")
    ) {
      return { ok: false, error: "Company name is required." };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  const emailError = emailSaveError(parsedProvider.data.email, options.previousEmail);
  if (emailError) {
    return { ok: false, error: emailError };
  }

  return { ok: true, data: parsedProvider.data, rates: parsedRates.data as RateDetails };
}
