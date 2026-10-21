import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { retryOnPgrst303, type Sleep } from "@/lib/supabase/pgrst303-retry";
import type { SnapshotRow } from "./snapshot-schema";

// SERVER-ONLY. Locks a Landed Cost version with the service role, through the
// save_landed_cost_snapshot() database function and nothing else: the
// function can only be executed by the service role, and it stamps created_by
// from the user id given here, takes only an allow-list of fields, numbers the
// version, and re-checks the version against the saved workspace and its
// sums (docs/SECURITY.md, "Service-role exception: locking Landed Cost
// versions"). The ONLY caller is lockWorkspaceAction in landed-cost/actions.ts,
// after requireStaff(), the flag, the owner check, the stale check and the
// server-side calculation. A test fails if any other file uses the
// service-role client or imports this one.

// A user is waiting, so the same short bounded retry as saving an estimate.
// PGRST303 is answered before the function runs, so a retry can't lock twice.
export const SNAPSHOT_RETRY_DELAYS_MS = [1000, 2000] as const;

export type SaveSnapshotResult =
  | { ok: true; id: string; versionNo: number }
  | { ok: false; code: string | null; message: string | null };

export async function saveLandedCostSnapshot(
  userId: string,
  row: SnapshotRow,
  deps: { client?: SupabaseClient; sleep?: Sleep } = {},
): Promise<SaveSnapshotResult> {
  try {
    const client = deps.client ?? createAdminClient();
    const data = await retryOnPgrst303(
      "saveLandedCostSnapshot",
      async () => {
        const { data, error } = await client.rpc("save_landed_cost_snapshot", { p_user_id: userId, p_row: row });
        if (error) throw error;
        return data as unknown;
      },
      deps.sleep,
      SNAPSHOT_RETRY_DELAYS_MS,
    );
    const saved = data as { id?: unknown; version_no?: unknown } | null;
    if (typeof saved?.id !== "string" || typeof saved.version_no !== "number") {
      throw new Error("save_landed_cost_snapshot returned no id");
    }
    return { ok: true, id: saved.id, versionNo: saved.version_no };
  } catch (error) {
    console.error("saveLandedCostSnapshot error:", error);
    const e = error as { code?: unknown; message?: unknown };
    return { ok: false, code: typeof e?.code === "string" ? e.code : null, message: typeof e?.message === "string" ? e.message : null };
  }
}
