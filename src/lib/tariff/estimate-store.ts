import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { retryOnPgrst303, type Sleep } from "@/lib/supabase/pgrst303-retry";

// SERVER-ONLY. Saves a duty estimate with the service role, through the
// save_duty_estimate() database function and nothing else: the function can
// only be executed by the service role, and it stamps created_by from the
// user id given here, takes only an allow-list of fields, and re-checks what
// the database can (docs/SECURITY.md, "Service-role exception: saveEstimate").
// The ONLY caller is saveEstimate in tariff-calculator/actions.ts, after it
// has checked the user (getUser), the project link and the confirmations and
// has calculated the estimate on the server. A test fails if any other file
// uses the service-role client.

export const SAVE_FAILED = "Couldn't save the estimate right now. Try again.";

// A user is waiting, so a short bounded retry (3 attempts, 3 s of waiting)
// for the sb_secret_ key's intermittent PGRST303 clock-skew error. PGRST303 is
// answered before the function runs, so a retry can't save twice.
export const ESTIMATE_RETRY_DELAYS_MS = [1000, 2000] as const;

export type SaveEstimateResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveDutyEstimate(
  userId: string,
  row: Record<string, unknown>,
  deps: { client?: SupabaseClient; sleep?: Sleep } = {},
): Promise<SaveEstimateResult> {
  try {
    const client = deps.client ?? createAdminClient();
    const id = await retryOnPgrst303(
      "saveDutyEstimate",
      async () => {
        const { data, error } = await client.rpc("save_duty_estimate", { p_user_id: userId, p_row: row });
        if (error) throw error;
        return data as unknown;
      },
      deps.sleep,
      ESTIMATE_RETRY_DELAYS_MS,
    );
    if (typeof id !== "string") throw new Error("save_duty_estimate returned no id");
    return { ok: true, id };
  } catch (error) {
    console.error("saveDutyEstimate error:", error);
    return { ok: false, error: SAVE_FAILED };
  }
}
