import type { createClient } from "@/lib/supabase/server";
import { feeAudit, type DisplayNames, type FeeAudit, type FeeAuditRow, type FeeHistoryRow } from "./fee-audit";

// Loads each fee row's history and the display names of the people in it,
// for the Fees page. Reads through the signed-in tariff editor's client:
// customs_fees, tariff_data_history and profiles are readable by staff.
// Only first_name is read from profiles, so no email can reach the page.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadFeeAudits(
  supabase: Supabase,
  fees: (FeeAuditRow & { id: string })[],
): Promise<Map<string, FeeAudit>> {
  if (fees.length === 0) return new Map();
  const { data: historyData, error: historyError } = await supabase
    .from("tariff_data_history")
    .select("id, row_id, operation, old_row, new_row, changed_by, changed_at")
    .eq("table_name", "customs_fees")
    .in(
      "row_id",
      fees.map((f) => f.id),
    )
    .order("changed_at", { ascending: false });
  if (historyError) throw historyError;
  const history = (historyData ?? []) as FeeHistoryRow[];

  const ids = [
    ...new Set(
      [...fees.flatMap((f) => [f.created_by, f.updated_by]), ...history.map((h) => h.changed_by)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const names: DisplayNames = new Map();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("profiles").select("id, first_name").in("id", ids);
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; first_name: string | null }[]) names.set(p.id, p.first_name);
  }

  return new Map(fees.map((f) => [f.id, feeAudit(f, history.filter((h) => h.row_id === f.id), names)]));
}
