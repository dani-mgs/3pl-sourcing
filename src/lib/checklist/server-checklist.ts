import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import type { ChecklistItem, ChecklistView } from "./checklist";
import { buildHint, type DutyRateRow, type ProgramStatusRow } from "./hints";

// Reads for /admin/checklist, through the signed-in user's client (RLS lets
// tariff editors and admins read the checklist; duty data is readable by any
// signed-in user). Read-only: the hints never write anything.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ITEM_COLUMNS =
  "id, key, group_key, sort_order, title, description, kind, editable_by, link_href, hint_kind, hint_ref, done, done_by, done_at, note, version, updated_by, updated_at";

export async function loadChecklist(supabase: Supabase): Promise<{
  items: ChecklistView[];
  names: Record<string, string>;
}> {
  const today = todayUtc();
  const itemsResult = await supabase
    .from("expert_checklist_items")
    .select(ITEM_COLUMNS)
    .order("group_key")
    .order("sort_order");
  if (itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data ?? []) as ChecklistItem[];

  // Only fetch what some item's hint needs.
  const refs = (kind: string) => items.filter((i) => i.hint_kind === kind).map((i) => i.hint_ref as string);
  const programKeys = [...refs("program_review"), ...refs("program_rows")];
  const headings = refs("duty_row_rate");
  const [programsResult, rowsResult] = await Promise.all([
    programKeys.length
      ? supabase.from("duty_program_review_status").select("program_key, review_status, row_count").in("program_key", programKeys)
      : Promise.resolve({ data: [], error: null }),
    headings.length
      ? supabase
          .from("additional_duties")
          .select("chapter99_heading, rate_type, rate_pct, effective_from, effective_to")
          .in("chapter99_heading", headings)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (programsResult.error) throw programsResult.error;
  if (rowsResult.error) throw rowsResult.error;
  const data = {
    programs: (programsResult.data ?? []) as ProgramStatusRow[],
    dutyRows: (rowsResult.data ?? []) as DutyRateRow[],
  };

  const ids = [...new Set(items.flatMap((i) => [i.done_by, i.updated_by]).filter((id): id is string => Boolean(id)))];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profiles, error } = await supabase.from("profiles").select("id, email, first_name").in("id", ids);
    if (error) throw error;
    for (const p of profiles ?? []) names[p.id as string] = (p.first_name as string | null)?.trim() || (p.email as string);
  }

  return { items: items.map((item) => ({ ...item, hint: buildHint(item, data, today) })), names };
}
