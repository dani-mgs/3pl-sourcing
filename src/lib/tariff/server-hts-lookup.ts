import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BROWSE_LIMIT,
  RESULT_LIMIT,
  parseLookupRows,
  type LookupLine,
  type LookupQuery,
} from "./hts-lookup";

// HTS lookup reads, as the signed-in user (RLS applies). The search is one
// parameterised RPC; the query has already been parsed (parseLookupQuery),
// and the function validates its input again.

export type CurrentRelease = { name: string; title: string | null; release_start_date: string | null };

export async function loadCurrentRelease(supabase: SupabaseClient): Promise<CurrentRelease | null> {
  const { data, error } = await supabase
    .from("hts_releases")
    .select("name, title, release_start_date")
    .eq("status", "current")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type LookupResult = { lines: LookupLine[]; total: number };

async function search(supabase: SupabaseClient, args: { p_terms?: string[]; p_code?: string; p_limit: number }) {
  const { data, error } = await supabase.rpc("search_hts_lines", args);
  if (error) throw error;
  const lines = parseLookupRows(data);
  return { lines, total: lines[0]?.total_count ?? 0 };
}

export async function searchHts(
  supabase: SupabaseClient,
  query: Extract<LookupQuery, { kind: "code" | "keywords" }>,
): Promise<LookupResult> {
  return query.kind === "code"
    ? search(supabase, { p_code: query.digits, p_limit: RESULT_LIMIT })
    : search(supabase, { p_terms: query.terms, p_limit: RESULT_LIMIT });
}

// Every line under a 4-digit heading, for browse mode.
export async function browseHeading(supabase: SupabaseClient, heading: string): Promise<LookupResult> {
  return search(supabase, { p_code: heading, p_limit: BROWSE_LIMIT });
}
