import type { createClient } from "@/lib/supabase/server";
import { formatRateDate, timestampDateUtc } from "@/lib/fx/rate-provenance";
import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { personName, type DisplayNames } from "@/lib/tariff/fee-audit";

// SERVER-ONLY. The Landed Cost list: the most recently updated workspaces
// with their owner's name (first name only, never an email), origin and SKU
// count, through the caller's client (RLS: any staff member reads). At most
// LIST_LIMIT workspaces, so every read stays under the API's 1,000 rows
// (SKU lines are read in pages).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const LIST_LIMIT = 50;
const PAGE = 1000;

export type WorkspaceListRow = {
  id: string;
  name: string;
  ownerName: string;
  entryDate: string;
  origin: string;
  skuCount: number;
  updated: string;
};

export type WorkspaceList = { ok: true; rows: WorkspaceListRow[]; more: boolean } | { ok: false; message: string };

// First names by user id (null when the profile has none).
export async function loadFirstNames(supabase: Supabase, ids: string[]): Promise<DisplayNames> {
  const names: DisplayNames = new Map();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;
  const { data, error } = await supabase.from("profiles").select("id, first_name").in("id", unique);
  if (error) throw error;
  for (const p of (data ?? []) as { id: string; first_name: string | null }[]) names.set(p.id, p.first_name);
  return names;
}

async function skuCounts(supabase: Supabase, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("landed_cost_sku_lines")
      .select("id, workspace_id")
      .in("workspace_id", ids)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { workspace_id: string }[]) counts.set(r.workspace_id, (counts.get(r.workspace_id) ?? 0) + 1);
    if ((data ?? []).length < PAGE) return counts;
  }
}

export async function listWorkspaces(supabase: Supabase): Promise<WorkspaceList> {
  try {
    const { data, error } = await supabase
      .from("landed_cost_workspaces")
      .select("id, owner_id, name, entry_date, updated_at, baseline_scenario_id")
      .order("updated_at", { ascending: false })
      .limit(LIST_LIMIT + 1);
    if (error) throw error;
    const all = (data ?? []) as { id: string; owner_id: string; name: string; entry_date: string; updated_at: string; baseline_scenario_id: string | null }[];
    const workspaces = all.slice(0, LIST_LIMIT);
    if (workspaces.length === 0) return { ok: true, rows: [], more: false };

    const ids = workspaces.map((w) => w.id);
    const [scenarios, counts, names] = await Promise.all([
      supabase.from("landed_cost_scenarios").select("id, workspace_id, origin_country, sort_order").in("workspace_id", ids),
      skuCounts(supabase, ids),
      loadFirstNames(supabase, workspaces.map((w) => w.owner_id)),
    ]);
    if (scenarios.error) throw scenarios.error;
    const countries = new Map(ORIGIN_COUNTRIES.map((c) => [c.code, c.name]));
    const byWorkspace = new Map<string, { id: string; origin_country: string; sort_order: number }[]>();
    for (const s of (scenarios.data ?? []) as { id: string; workspace_id: string; origin_country: string; sort_order: number }[]) {
      byWorkspace.set(s.workspace_id, [...(byWorkspace.get(s.workspace_id) ?? []), s]);
    }

    return {
      ok: true,
      more: all.length > LIST_LIMIT,
      rows: workspaces.map((w) => {
        const list = [...(byWorkspace.get(w.id) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        // The baseline's origin, else the first scenario's.
        const shown = list.find((s) => s.id === w.baseline_scenario_id) ?? list[0];
        return {
          id: w.id,
          name: w.name,
          ownerName: personName(w.owner_id, names),
          entryDate: formatRateDate(w.entry_date),
          origin: shown ? (countries.get(shown.origin_country) ?? shown.origin_country) : "No scenario",
          skuCount: counts.get(w.id) ?? 0,
          updated: formatRateDate(timestampDateUtc(w.updated_at)),
        };
      }),
    };
  } catch (error) {
    // Details stay in the server log.
    console.error("listWorkspaces error:", error);
    return { ok: false, message: "The workspaces couldn't be loaded right now. Try again." };
  }
}
