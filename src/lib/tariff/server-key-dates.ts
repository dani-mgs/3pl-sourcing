import type { createClient } from "@/lib/supabase/server";
import type { ReviewStatus } from "./additional-duties";
import { countryName } from "./countries";
import { keyDates, type KeyDate, type KeyDateRow } from "./key-dates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Upcoming dated changes in the duty data, read with the signed-in user's
// client (the duty tables are readable by any signed-in user). A failed read
// shows as an empty list rather than breaking the page.
export async function loadKeyDates(supabase: Supabase, today: string): Promise<KeyDate[]> {
  const [rowsResult, programsResult, statusResult] = await Promise.all([
    supabase
      .from("additional_duties")
      .select("program_key, chapter99_heading, label, rate_type, rate_pct, origin_countries, hts_scope, effective_from, effective_to")
      .or(`effective_from.gt.${today},effective_to.gte.${today}`),
    supabase.from("duty_programs").select("key, name"),
    supabase.from("duty_program_review_status").select("program_key, review_status"),
  ]);
  for (const result of [rowsResult, programsResult, statusResult]) {
    if (result.error) {
      console.error("loadKeyDates error:", result.error);
      return [];
    }
  }
  return keyDates({
    rows: (rowsResult.data ?? []) as KeyDateRow[],
    today,
    programNames: new Map((programsResult.data ?? []).map((p) => [p.key as string, p.name as string])),
    reviewStatus: new Map(
      (statusResult.data ?? []).map((s) => [s.program_key as string, s.review_status as ReviewStatus]),
    ),
    countryName,
  });
}
