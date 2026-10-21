import type { createClient } from "@/lib/supabase/server";
import type { DutyRow } from "@/lib/tariff/additional-duties";
import { FEE_COLUMNS } from "@/lib/tariff/customs-fees";
import { LINE_COLUMNS, type HtsLineRecord } from "@/lib/tariff/hts-line-match";
import type { FeeRowWithDates } from "./entry-fees";
import { PROGRAM_COLUMNS, type DutyProgramRow } from "@/lib/tariff/programs";
import {
  API_ROW_LIMIT,
  DUTY_COLUMNS,
  belowRowLimit,
  SCOPE_COLUMNS,
  candidatePrefixes,
  earliestReview,
  reviewerIds,
  reviewerNames,
  type ChangeRow,
  type RawDutyData,
  type ScopeRow,
  type StatusRow,
} from "@/lib/tariff/server-duty-data";

// SERVER-ONLY. The reads behind the batch duty loader, each done once per
// call whatever the number of SKU lines or origins: the same tables and
// columns buildEstimate reads, through the caller's client (RLS applies; never
// the service role). Long value lists go in groups of GROUP_SIZE so a request
// URL stays short, and multi-row reads are paged (PostgREST returns at most
// 1,000 rows) up to MAX_PAGES, past which the read fails rather than use cut-
// off data.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>;

export const GROUP_SIZE = 150;
export const PAGE_SIZE = API_ROW_LIMIT;
export const MAX_PAGES = 20;

export class TooMuchDataError extends Error {}

async function readPaged<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let n = 0; n < MAX_PAGES; n++) {
    const { data, error } = await page(n * PAGE_SIZE, (n + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
  throw new TooMuchDataError(`more than ${MAX_PAGES} pages`);
}

async function readGrouped<T>(values: string[], page: (group: string[], from: number, to: number) => Page): Promise<T[]> {
  if (values.length === 0) return [];
  const groups: string[][] = [];
  for (let i = 0; i < values.length; i += GROUP_SIZE) groups.push(values.slice(i, i + GROUP_SIZE));
  const results = await Promise.all(groups.map((group) => readPaged<T>((from, to) => page(group, from, to))));
  return results.flat();
}

export type FirstReads = {
  release: { id: string; name: string; title: string | null; release_start_date: string | null } | null;
  column2: { country_code: string; effective_from: string | null; effective_to: string | null }[];
  programs: DutyProgramRow[];
  duties: Omit<DutyRow, "scope">[];
  statuses: StatusRow[];
};

// Reads that need nothing from the request but its origins.
export async function readShared(supabase: Supabase, origins: string[]): Promise<FirstReads> {
  const [release, column2, programs, duties, statuses] = await Promise.all([
    supabase.from("hts_releases").select("id, name, title, release_start_date").eq("status", "current").maybeSingle(),
    supabase.from("hts_column2_countries").select("country_code, effective_from, effective_to").in("country_code", origins),
    supabase.from("duty_programs").select(PROGRAM_COLUMNS),
    // About 125 rows: read whole, as buildEstimate does (failing at the row limit).
    supabase.from("additional_duties").select(DUTY_COLUMNS),
    supabase.from("duty_program_review_status").select("program_key, review_status, last_reviewed_at, last_reviewed_by"),
  ]);
  for (const result of [release, column2, programs, duties, statuses]) if (result.error) throw result.error;
  return {
    release: release.data as FirstReads["release"],
    column2: (column2.data ?? []) as FirstReads["column2"],
    programs: (programs.data ?? []) as DutyProgramRow[],
    duties: belowRowLimit(duties.data, "additional_duties") as unknown as Omit<DutyRow, "scope">[],
    statuses: (statuses.data ?? []) as StatusRow[],
  };
}

// Each code's own line and, for an 8-digit code, the 10-digit lines under it
// (findLine's two reads, for every code at once).
export function readHtsLines(supabase: Supabase, releaseId: string, digits: string[]): Promise<HtsLineRecord[]> {
  const patterns = digits.flatMap((d) => (d.length === 8 ? [d, `${d}__`] : [d]));
  return readGrouped<HtsLineRecord>(patterns, (group, from, to) =>
    supabase.from("hts_lines").select(LINE_COLUMNS).eq("release_id", releaseId).likeAnyOf("hts_code", group).order("hts_code").range(from, to),
  );
}

// Reviewer names and chapter 99 changes since the earliest review, as
// loadAdditionalDutyData reads them.
export async function readReviewDetails(supabase: Supabase, statuses: StatusRow[]): Promise<Pick<RawDutyData, "names" | "changes">> {
  const ids = reviewerIds(statuses);
  const earliest = earliestReview(statuses);
  const [profiles, changes] = await Promise.all([
    ids.length > 0 ? supabase.from("profiles").select("id, email, first_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
    earliest
      ? supabase.from("hts_chapter99_changes").select("hts_code, detected_at").gt("detected_at", earliest)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) throw profiles.error;
  if (changes.error) throw changes.error;
  return {
    names: reviewerNames((profiles.data ?? []) as { id: string; email: string; first_name: string | null }[]),
    changes: belowRowLimit(changes.data, "hts_chapter99_changes") as ChangeRow[],
  };
}

// The scope lines every resolved code could need: each code's prefixes, and
// the lines under each code shorter than 10 digits. Read by id so pages are
// stable; a line found by both reads is kept once.
export async function readScope(supabase: Supabase, codes: string[]): Promise<ScopeRow[]> {
  const prefixes = [...new Set(codes.flatMap(candidatePrefixes))];
  const children = [...new Set(codes.filter((c) => c.length < 10).map((c) => `${c}_%`))];
  const columns = `id, ${SCOPE_COLUMNS}`;
  const [direct, under] = await Promise.all([
    readGrouped<ScopeRow & { id: string }>(prefixes, (group, from, to) =>
      supabase.from("additional_duty_scope").select(columns).in("hts_prefix", group).order("id").range(from, to),
    ),
    readGrouped<ScopeRow & { id: string }>(children, (group, from, to) =>
      supabase.from("additional_duty_scope").select(columns).likeAnyOf("hts_prefix", group).order("id").range(from, to),
    ),
  ]);
  const byId = new Map([...direct, ...under].map((s) => [s.id, s]));
  return [...byId.values()].map(({ duty_id, hts_prefix, article_description, excluded }) => ({ duty_id, hts_prefix, article_description, excluded }));
}

// Every customs fee row, as buildEstimate reads them (a few dozen at most;
// failing at the row limit). Landed Cost picks those in force on the entry
// date, and warns from the whole list when its fiscal year isn't entered.
export async function readFeeRows(supabase: Supabase): Promise<FeeRowWithDates[]> {
  const { data, error } = await supabase.from("customs_fees").select(FEE_COLUMNS);
  if (error) throw error;
  return belowRowLimit(data, "customs_fees") as FeeRowWithDates[];
}
