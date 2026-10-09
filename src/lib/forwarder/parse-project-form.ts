import { z } from "zod";
import {
  BROKERAGE_OPTIONS,
  CURRENCIES,
  INCOTERMS,
  INSURANCE_OPTIONS,
  PROJECT_DURATION_ERROR,
  PROJECT_DURATION_MAX,
  PROJECT_DURATION_MIN,
  PROJECT_STATUSES,
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
  STACKABLE_OPTIONS,
  YES_NO,
  isTypeAllowedForMode,
} from "./project-fields";

// Turns the forwarder project intake form into a validated forwarder_projects
// row (everything except client_id and owner_id, which the action sets).
// Field names in the form are the column names.

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const text = (max = 2000) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

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

const INT_MAX = 2_147_483_647;
const integer = z.preprocess(
  (value) => {
    const v = blankToNull(value);
    return v == null ? null : Number(v);
  },
  z.number().int().min(0).max(INT_MAX).nullable(),
);

// Digits only, so 1.5, -3, 1e2, 0x10 and text are all refused rather than
// coerced by Number(). The range matches the column's check constraint.
const projectDuration = z.preprocess(
  (value) => {
    const v = blankToNull(value);
    if (v == null) return null;
    return typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  },
  z.number().int().min(PROJECT_DURATION_MIN).max(PROJECT_DURATION_MAX).nullable(),
);

const projectSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  project_duration_months: projectDuration,

  packing_list_available: option(YES_NO),
  packing_list_reference: text(),
  packing_list_notes: text(),

  origin_country: text(200),
  origin_city: text(200),
  origin_port: text(200),
  destination_country: text(200),
  destination_city: text(200),
  destination_port: text(200),
  final_delivery_address: text(),

  weight_kg: decimal(1e11), // numeric(14,3)
  cbm: decimal(1e8), // numeric(14,6)
  pallets: integer,
  cartons: integer,

  cargo_description: text(),
  packaging_type: text(200),
  units: integer,
  stackable: option(STACKABLE_OPTIONS),
  dangerous_goods: option(YES_NO),
  temperature_controlled: option(YES_NO),
  special_handling: text(),

  shipment_mode: option(SHIPMENT_MODES),
  shipment_type: option(SHIPMENT_TYPES),

  current_incoterm: option(INCOTERMS),
  final_incoterm: option(INCOTERMS),
  incoterms_to_compare: z.array(z.enum(INCOTERMS)),
  final_shipment_mode: option(SHIPMENT_MODES),
  final_shipment_type: option(SHIPMENT_TYPES),

  // Text, never numeric: HS codes can have significant leading zeros.
  hs_code: text(50),
  invoice_value: decimal(1e12), // numeric(14,2)
  invoice_currency: option(CURRENCIES),

  current_freight_cost_usd: decimal(1e12), // numeric(14,2)
  current_freight_forwarder: text(200),

  shipments_per_month: decimal(1e8), // numeric(10,2)
  shipments_per_year: decimal(1e8), // numeric(10,2)

  current_lead_time_days: decimal(1e5), // numeric(6,1)
  target_lead_time_days: decimal(1e5), // numeric(6,1)

  insurance_required: option(INSURANCE_OPTIONS),
  brokerage_needed: option(BROKERAGE_OPTIONS),
});

export type ForwarderProjectFields = z.infer<typeof projectSchema>;

const FIELD_NAMES = Object.keys(projectSchema.shape) as (keyof ForwarderProjectFields)[];

// Every column the intake form edits. create_forwarder_project_with_client()
// keeps the same list, minus status (a Vitest check compares them).
export const FORWARDER_PROJECT_FIELDS: readonly (keyof ForwarderProjectFields)[] = FIELD_NAMES;

// Every column the intake form edits, as a Supabase select list.
export const FORWARDER_PROJECT_FIELDS_SELECT = FIELD_NAMES.join(", ");

export type ParseProjectResult =
  | { ok: true; data: ForwarderProjectFields }
  | { ok: false; error: string };

// `status` isn't on the create form; new projects start Active.
export function parseForwarderProjectForm(formData: FormData): ParseProjectResult {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }
  raw.status = formData.get("status") || "Active";
  // Unique, in the canonical incoterm order.
  const picked = new Set(formData.getAll("incoterms_to_compare").map(String));
  raw.incoterms_to_compare = [...picked];

  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    console.error("parseForwarderProjectForm validation failed:", parsed.error.issues);
    if (parsed.error.issues.some((issue) => issue.path[0] === "project_duration_months")) {
      return { ok: false, error: PROJECT_DURATION_ERROR };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  const data = parsed.data;
  data.incoterms_to_compare = INCOTERMS.filter((term) =>
    data.incoterms_to_compare.includes(term),
  );

  if (!isTypeAllowedForMode(data.shipment_mode, data.shipment_type)) {
    return {
      ok: false,
      error: "The current shipment type doesn't match the current shipment mode.",
    };
  }
  if (!isTypeAllowedForMode(data.final_shipment_mode, data.final_shipment_type)) {
    return {
      ok: false,
      error: "The final shipment type doesn't match the final shipment mode.",
    };
  }

  return { ok: true, data };
}
