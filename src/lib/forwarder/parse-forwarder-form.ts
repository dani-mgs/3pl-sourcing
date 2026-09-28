import { z } from "zod";
import {
  CAPABILITY_FIELDS,
  FORWARDER_ASSESSMENT_OPTIONS,
  FORWARDER_STATUS_OPTIONS,
} from "./forwarder-fields";

// Turns the add/edit forwarder form into a validated `forwarders` row
// (everything except forwarder_project_id, which the action sets). Field
// names in the form are the column names. No numeric fields on this table.

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

const forwarderSchema = z.object({
  company_name: requiredText(200),
  website: text(500),
  headquarters: text(200),
  footprint: text(),
  contact_person: text(200),
  contact_position: text(200),
  email: text(320),
  phone: text(50),
  origin_coverage: text(),
  destination_coverage: text(),
  other_services: text(),

  air_freight: bool,
  sea_freight: bool,
  road_freight: bool,
  fcl: bool,
  lcl: bool,
  courier_express: bool,
  customs_brokerage: bool,
  cargo_insurance: bool,
  door_to_door: bool,
  port_to_port: bool,
  customs_import_assistance: bool,

  status: z.preprocess(blankToNull, z.enum(FORWARDER_STATUS_OPTIONS)),
  assessment: option(FORWARDER_ASSESSMENT_OPTIONS),
  next_action: text(),
  key_notes: text(),
});

export type ForwarderFields = z.infer<typeof forwarderSchema>;

const FIELD_NAMES = Object.keys(forwarderSchema.shape) as (keyof ForwarderFields)[];

// Every column the add/edit form edits, as a Supabase select list.
export const FORWARDER_FIELDS_SELECT = FIELD_NAMES.join(", ");

export type ParseForwarderResult =
  | { ok: true; data: ForwarderFields }
  | { ok: false; error: string };

export function parseForwarderForm(formData: FormData): ParseForwarderResult {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }
  for (const capability of CAPABILITY_FIELDS) {
    // Hidden inputs always post "true"/"false"; default a missing one to
    // false rather than letting it fail validation.
    raw[capability.name] = formData.get(capability.name) ?? "false";
  }
  raw.status = formData.get("status") || "Potential / Not Contacted";

  const parsed = forwarderSchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    console.error("parseForwarderForm validation failed:", parsed.error.issues);
    if (parsed.error.issues.some((issue) => issue.path[0] === "company_name")) {
      return { ok: false, error: "Company name is required." };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  return { ok: true, data: parsed.data };
}
