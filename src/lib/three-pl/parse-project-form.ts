import { z } from "zod";
import {
  CONTRACT_PERIOD_ERROR,
  CONTRACT_PERIOD_MAX,
  CONTRACT_PERIOD_MIN,
} from "./contract-period";

// Turns the 3PL client-intake / project-info-edit form into a validated
// three_pl_projects row (everything except client_id/owner_id/status, which
// the action sets). Field names in the form are the column names.

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const text = (max = 2000) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

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
const contractPeriod = z.preprocess(
  (value) => {
    const v = blankToNull(value);
    if (v == null) return null;
    return typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  },
  z.number().int().min(CONTRACT_PERIOD_MIN).max(CONTRACT_PERIOD_MAX).nullable(),
);

const projectSchema = z.object({
  target_geography: text(500),
  contract_period_months: contractPeriod,
  benchmark_period: text(200),

  avg_monthly_orders: integer,
  peak_monthly_orders: integer,
  latest_month_orders: integer,
  avg_monthly_units: integer,
  peak_monthly_units: integer,

  core_cost_categories: text(),
  main_decision_focus: text(),
  key_capability_needs: text(),
  tech_integration_requirement: text(),
  special_handling_requirement: text(),
  fixed_comparison_principle: text(),
  important_limitation: text(),
  assumptions_data_limitations: text(),
});

export type ProjectFields = z.infer<typeof projectSchema>;

const FIELD_NAMES = Object.keys(projectSchema.shape) as (keyof ProjectFields)[];

// The same list is the allow-list of create_three_pl_project_with_client()
// (a Vitest check compares them), so a new field must be added there too.
export const THREE_PL_PROJECT_FIELDS: readonly (keyof ProjectFields)[] = FIELD_NAMES;

// Every column the intake/edit form edits, as a Supabase select list.
export const PROJECT_FIELDS_SELECT = FIELD_NAMES.join(", ");

export type ParseProjectResult =
  | { ok: true; data: ProjectFields }
  | { ok: false; error: string };

export function parseProjectForm(formData: FormData): ParseProjectResult {
  const raw: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    raw[name] = formData.get(name);
  }

  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level schema detail stays server-side (docs/SECURITY.md).
    console.error("parseProjectForm validation failed:", parsed.error.issues);
    if (parsed.error.issues.some((issue) => issue.path[0] === "contract_period_months")) {
      return { ok: false, error: CONTRACT_PERIOD_ERROR };
    }
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  return { ok: true, data: parsed.data };
}

export const SUMMARY_NOTES_MAX = 10000;

// Says why long notes are refused (QA B-12: the message used to be generic).
export function summaryNotesTooLongMessage(length: number): string {
  return `Notes can be up to ${SUMMARY_NOTES_MAX.toLocaleString("en-US")} characters (this has ${length.toLocaleString("en-US")}).`;
}
const summaryNotesSchema = z.object({
  summary_notes: text(SUMMARY_NOTES_MAX),
});

export type ParseSummaryNotesResult =
  | { ok: true; data: { summary_notes: string | null } }
  | { ok: false; error: string };

export function parseSummaryNotesForm(formData: FormData): ParseSummaryNotesResult {
  const raw = formData.get("summary_notes");
  const length = typeof raw === "string" ? raw.trim().length : 0;
  if (length > SUMMARY_NOTES_MAX) {
    return { ok: false, error: summaryNotesTooLongMessage(length) };
  }
  const parsed = summaryNotesSchema.safeParse({
    summary_notes: formData.get("summary_notes"),
  });
  if (!parsed.success) {
    console.error("parseSummaryNotesForm validation failed:", parsed.error.issues);
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }
  return { ok: true, data: parsed.data };
}
