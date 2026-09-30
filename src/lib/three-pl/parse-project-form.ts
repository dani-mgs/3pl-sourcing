import { z } from "zod";

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

const projectSchema = z.object({
  target_geography: text(500),
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
    return {
      ok: false,
      error: "Some fields have values that aren't allowed. Check the form and try again.",
    };
  }

  return { ok: true, data: parsed.data };
}

const SUMMARY_NOTES_MAX = 10000;
const summaryNotesSchema = z.object({
  summary_notes: text(SUMMARY_NOTES_MAX),
});

export type ParseSummaryNotesResult =
  | { ok: true; data: { summary_notes: string | null } }
  | { ok: false; error: string };

export function parseSummaryNotesForm(formData: FormData): ParseSummaryNotesResult {
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
