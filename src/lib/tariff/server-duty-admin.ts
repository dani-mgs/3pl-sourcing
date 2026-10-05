import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { inForceOn, staleReason, type ReviewStatus } from "./additional-duties";
import type { DutyProgramRow } from "./programs";
import { headingGroup } from "./server-duty-data";

// Reads for the duty-data pages (tariff editors and admins): each program's
// review state and chapter 99 changes since its review, and one program's
// rows, scope counts, reviews and history.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Chapter99Change = {
  hts_code: string;
  change: "added" | "removed" | "changed";
  old_description: string | null;
  new_description: string | null;
  old_rate: string | null;
  new_rate: string | null;
  release_name: string;
  detected_at: string;
};

export type ProgramOverview = {
  program: DutyProgramRow;
  status: ReviewStatus;
  rowsInForce: number;
  reviewedAt: string | null;
  reviewedByName: string | null;
  staleReason: string | null;
  changesSinceReview: Chapter99Change[];
};

async function names(supabase: Supabase, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, email, first_name").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, (p.first_name as string | null)?.trim() || (p.email as string)]));
}

const PROGRAM_COLUMNS =
  "key, name, status, warning_text, trigger_origins, trigger_hts_prefixes, indicative_rates, source_label, source_url, sort_order";

export async function loadProgramsOverview(supabase: Supabase): Promise<{
  overviews: ProgramOverview[];
  recentChanges: Chapter99Change[];
}> {
  const today = todayUtc();
  const [programsResult, statusResult, rowsResult, changesResult] = await Promise.all([
    supabase.from("duty_programs").select(PROGRAM_COLUMNS).order("sort_order"),
    supabase.from("duty_program_review_status").select("program_key, review_status, last_reviewed_at, last_reviewed_by"),
    supabase.from("additional_duties").select("program_key, chapter99_heading, effective_from, effective_to"),
    supabase
      .from("hts_chapter99_changes")
      .select("hts_code, change, old_description, new_description, old_rate, new_rate, release_name, detected_at")
      .order("detected_at", { ascending: false })
      .limit(500),
  ]);
  for (const r of [programsResult, statusResult, rowsResult, changesResult]) if (r.error) throw r.error;

  const statuses = new Map(
    ((statusResult.data ?? []) as { program_key: string; review_status: ReviewStatus; last_reviewed_at: string | null; last_reviewed_by: string | null }[]).map((s) => [s.program_key, s]),
  );
  const reviewers = await names(supabase, [...statuses.values()].map((s) => s.last_reviewed_by));
  const rows = (rowsResult.data ?? []) as { program_key: string; chapter99_heading: string; effective_from: string; effective_to: string | null }[];
  const changes = (changesResult.data ?? []) as Chapter99Change[];

  const overviews = ((programsResult.data ?? []) as DutyProgramRow[]).map((program) => {
    const s = statuses.get(program.key);
    const mine = rows.filter((r) => r.program_key === program.key);
    const groups = new Set(mine.map((r) => headingGroup(r.chapter99_heading)));
    const changesSinceReview = s?.last_reviewed_at
      ? changes.filter((c) => c.detected_at > s.last_reviewed_at! && groups.has(headingGroup(c.hts_code)))
      : [];
    const reviewedByName = s?.last_reviewed_by ? (reviewers.get(s.last_reviewed_by) ?? null) : null;
    const status = s?.review_status ?? "not_loaded";
    return {
      program,
      status,
      rowsInForce: mine.filter((r) => inForceOn(r, today)).length,
      reviewedAt: s?.last_reviewed_at ?? null,
      reviewedByName,
      staleReason: staleReason(
        {
          programKey: program.key,
          status,
          reviewedAt: s?.last_reviewed_at ?? null,
          reviewedByName,
          chapter99ChangesSinceReview: changesSinceReview.length,
        },
        today,
      ),
      changesSinceReview,
    };
  });

  return { overviews, recentChanges: changes.slice(0, 50) };
}

export type ProgramDutyRow = {
  id: string;
  chapter99_heading: string;
  chapter99_heading_at_minimum: string | null;
  label: string;
  rate_type: "add" | "minimum_total" | "exempt" | "unconfirmed";
  rate_pct: number | null;
  origin_countries: string[] | null;
  hts_scope: "all" | "listed";
  condition_text: string | null;
  assume_condition: boolean;
  excludes_programs: string[];
  exclusion_heading: string | null;
  effective_from: string;
  effective_to: string | null;
  legal_status: "in_force" | "in_force_under_litigation" | "enjoined" | "expired";
  source_label: string;
  source_url: string;
  source_checked_on: string;
  // A second source link (e.g. the Chapter 99 PDF download) and what it is.
  source_document_url: string | null;
  source_document_label: string | null;
  notes: string | null;
  updated_at: string;
  scopeCount: number;
  // Statistical numbers the row takes out ("except …").
  excludedCount: number;
};

export type HistoryEntry = {
  id: number;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  changed_at: string;
  changedByName: string | null;
  summary: string;
};

function summarize(entry: { operation: string; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; table_name: string }): string {
  const row = entry.new_row ?? entry.old_row ?? {};
  const what =
    entry.table_name === "additional_duty_scope"
      ? `scope ${row.hts_prefix}${row.article_description ? ` (${row.article_description})` : ""}`
      : `${row.chapter99_heading} ${row.label ?? ""}`.trim();
  if (entry.operation !== "UPDATE" || !entry.old_row || !entry.new_row) return `${entry.operation.toLowerCase()} ${what}`;
  const changed = Object.keys(entry.new_row).filter(
    (k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify(entry.new_row![k]) !== JSON.stringify(entry.old_row![k]),
  );
  return `update ${what}: ${changed.map((k) => `${k} ${JSON.stringify(entry.old_row![k])} → ${JSON.stringify(entry.new_row![k])}`).join(", ")}`;
}

export async function loadProgramDetail(supabase: Supabase, programKey: string) {
  const [programResult, rowsResult, historyResult, reviewsResult] = await Promise.all([
    supabase.from("duty_programs").select(PROGRAM_COLUMNS).eq("key", programKey).maybeSingle(),
    supabase
      .from("additional_duties")
      .select(
        "id, chapter99_heading, chapter99_heading_at_minimum, label, rate_type, rate_pct, origin_countries, hts_scope, condition_text, assume_condition, excludes_programs, exclusion_heading, effective_from, effective_to, legal_status, source_label, source_url, source_checked_on, source_document_url, source_document_label, notes, updated_at",
      )
      .eq("program_key", programKey)
      .order("chapter99_heading")
      .order("effective_from"),
    supabase
      .from("tariff_data_history")
      .select("id, table_name, operation, old_row, new_row, changed_by, changed_at")
      .eq("program_key", programKey)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase
      .from("duty_program_reviews")
      .select("id, reviewed_by, reviewed_at, hts_release_name, note")
      .eq("program_key", programKey)
      .order("reviewed_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [programResult, rowsResult, historyResult, reviewsResult]) if (r.error) throw r.error;
  if (!programResult.data) return null;

  const rows = (rowsResult.data ?? []) as Omit<ProgramDutyRow, "scopeCount" | "excludedCount">[];
  const listed = rows.filter((r) => r.hts_scope === "listed").map((r) => r.id);
  // Counted in the database: a list can hold thousands of lines (List 3).
  const counts = new Map<string, { line_count: number; excluded_count: number }>();
  if (listed.length > 0) {
    const { data, error } = await supabase
      .from("additional_duty_scope_counts")
      .select("duty_id, line_count, excluded_count")
      .in("duty_id", listed);
    if (error) throw error;
    for (const c of (data ?? []) as { duty_id: string; line_count: number; excluded_count: number }[]) counts.set(c.duty_id, c);
  }

  const history = (historyResult.data ?? []) as {
    id: number;
    table_name: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    old_row: Record<string, unknown> | null;
    new_row: Record<string, unknown> | null;
    changed_by: string | null;
    changed_at: string;
  }[];
  const reviews = (reviewsResult.data ?? []) as {
    id: string;
    reviewed_by: string;
    reviewed_at: string;
    hts_release_name: string | null;
    note: string | null;
  }[];
  const people = await names(supabase, [...history.map((h) => h.changed_by), ...reviews.map((r) => r.reviewed_by)]);

  return {
    program: programResult.data as DutyProgramRow,
    rows: rows.map((r) => {
      const c = counts.get(r.id);
      return {
        ...r,
        rate_pct: r.rate_pct == null ? null : Number(r.rate_pct),
        scopeCount: c ? c.line_count - c.excluded_count : 0,
        excludedCount: c?.excluded_count ?? 0,
      };
    }),
    history: history.map<HistoryEntry>((h) => ({
      id: h.id,
      table_name: h.table_name,
      operation: h.operation,
      changed_at: h.changed_at,
      changedByName: h.changed_by ? (people.get(h.changed_by) ?? null) : null,
      summary: summarize(h),
    })),
    reviews: reviews.map((r) => ({ ...r, reviewedByName: people.get(r.reviewed_by) ?? null })),
  };
}

// The program's indicative HTS rates beside its flat rows in force, per
// origin, for the review screen.
export function indicativeComparison(
  program: DutyProgramRow,
  rows: ProgramDutyRow[],
  today: string,
): { origin: string; indicative: number; row: number | null; matches: boolean }[] {
  const rates = program.indicative_rates ?? {};
  return Object.entries(rates)
    .filter(([, v]) => typeof v === "number")
    .map(([origin, value]) => {
      const flat = rows.find(
        (r) => r.rate_type === "add" && inForceOn(r, today) && (r.origin_countries ?? []).includes(origin),
      );
      const row = flat?.rate_pct ?? null;
      return { origin, indicative: value as number, row, matches: row === value };
    })
    .sort((a, b) => a.origin.localeCompare(b.origin));
}

