import type { createClient } from "@/lib/supabase/server";
import { inForceOn, type DutyRow, type ProgramReview, type ReviewStatus } from "./additional-duties";

// Loads what evaluateAdditionalDuties needs for one HTS code: the duty rows
// in force on the date (with only the scope lines that could match this
// code, plus, for a code shorter than 10 digits, the lines listed under it),
// and each program's review state, reviewer name and chapter 99 changes
// since its review. Reads only, through the signed-in user's client.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DUTY_COLUMNS =
  "id, program_key, chapter99_heading, chapter99_heading_at_minimum, label, rate_type, rate_pct, origin_countries, " +
  "hts_scope, condition_text, assume_condition, excludes_programs, exclusion_heading, filing_order, effective_from, effective_to, " +
  "legal_status, source_label, source_url, source_checked_on";

// Every prefix of the code a scope line could hold (4–10 digits).
export function candidatePrefixes(htsCode: string): string[] {
  const prefixes: string[] = [];
  for (let n = 4; n <= Math.min(10, htsCode.length); n++) prefixes.push(htsCode.slice(0, n));
  return prefixes;
}

// Chapter 99 changes count against a program when they're in the same
// 6-digit group as one of its headings (e.g. 9903.05.xx).
export function headingGroup(headingOrCode: string): string {
  return headingOrCode.replace(/\./g, "").slice(0, 6);
}

export async function loadAdditionalDutyData(
  supabase: Supabase,
  htsCode: string,
  asOfDate: string,
): Promise<{ rows: DutyRow[]; reviews: ProgramReview[]; schedule: DutyRow[] }> {
  const SCOPE_COLUMNS = "duty_id, hts_prefix, article_description, excluded";
  const [dutiesResult, scopeResult, childResult, statusResult] = await Promise.all([
    supabase.from("additional_duties").select(DUTY_COLUMNS),
    supabase.from("additional_duty_scope").select(SCOPE_COLUMNS).in("hts_prefix", candidatePrefixes(htsCode)),
    htsCode.length < 10
      ? supabase.from("additional_duty_scope").select(SCOPE_COLUMNS).like("hts_prefix", `${htsCode}_%`)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("duty_program_review_status")
      .select("program_key, review_status, last_reviewed_at, last_reviewed_by"),
  ]);
  for (const result of [dutiesResult, scopeResult, childResult, statusResult]) {
    if (result.error) throw result.error;
  }

  type ScopeRow = { duty_id: string; hts_prefix: string; article_description: string | null; excluded: boolean };
  const scopeByDuty = new Map<string, DutyRow["scope"]>();
  for (const s of [...(scopeResult.data ?? []), ...(childResult.data ?? [])] as ScopeRow[]) {
    const list = scopeByDuty.get(s.duty_id) ?? [];
    list.push({ hts_prefix: s.hts_prefix, article_description: s.article_description, excluded: s.excluded });
    scopeByDuty.set(s.duty_id, list);
  }
  const allRows = (dutiesResult.data ?? []) as unknown as Omit<DutyRow, "scope">[];
  // Every row (not only those in force on the date) with the scope lines for
  // this code: `rows` are the ones in force; `schedule` is for the
  // scheduled-change warning (rows that start or end soon).
  const schedule: DutyRow[] = allRows.map((r) => ({
    ...r,
    excludes_programs: r.excludes_programs ?? [],
    scope: scopeByDuty.get(r.id) ?? [],
  }));
  const rows = schedule.filter((r) => inForceOn(r, asOfDate));

  type StatusRow = {
    program_key: string;
    review_status: ReviewStatus;
    last_reviewed_at: string | null;
    last_reviewed_by: string | null;
  };
  const statuses = (statusResult.data ?? []) as StatusRow[];
  const reviewed = statuses.filter((s) => s.last_reviewed_at);

  const reviewerIds = [...new Set(reviewed.map((s) => s.last_reviewed_by).filter((id): id is string => Boolean(id)))];
  const earliest = reviewed.map((s) => s.last_reviewed_at!).sort()[0];
  const [profilesResult, changesResult] = await Promise.all([
    reviewerIds.length > 0
      ? supabase.from("profiles").select("id, email, first_name").in("id", reviewerIds)
      : Promise.resolve({ data: [], error: null }),
    earliest
      ? supabase.from("hts_chapter99_changes").select("hts_code, detected_at").gt("detected_at", earliest)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (changesResult.error) throw changesResult.error;

  const names = new Map(
    ((profilesResult.data ?? []) as { id: string; email: string; first_name: string | null }[]).map((p) => [
      p.id,
      p.first_name?.trim() || p.email,
    ]),
  );
  const changes = (changesResult.data ?? []) as { hts_code: string; detected_at: string }[];
  const groupsOf = (programKey: string) =>
    new Set(allRows.filter((r) => r.program_key === programKey).map((r) => headingGroup(r.chapter99_heading)));

  const reviews: ProgramReview[] = statuses.map((s) => {
    const groups = groupsOf(s.program_key);
    return {
      programKey: s.program_key,
      status: s.review_status,
      reviewedAt: s.last_reviewed_at,
      reviewedByName: s.last_reviewed_by ? (names.get(s.last_reviewed_by) ?? null) : null,
      chapter99ChangesSinceReview: s.last_reviewed_at
        ? changes.filter((c) => c.detected_at > s.last_reviewed_at! && groups.has(headingGroup(c.hts_code))).length
        : 0,
    };
  });

  return { rows, reviews, schedule };
}
