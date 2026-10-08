import type { createClient } from "@/lib/supabase/server";
import { scheduledChanges, type ScheduledChange } from "./scheduled-changes";
import { loadAdditionalDutyData } from "./server-duty-data";
import type { EstimateResult } from "./server-estimate";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The scheduled changes known today for a saved estimate's line, origin and
// entry date. Read with the signed-in user's client and never stored: the
// saved estimate stays locked; this is a live look at the duty data.
export async function loadScheduledChangesForEstimate(
  supabase: Supabase,
  estimate: Pick<EstimateResult, "htsCode" | "originCountry" | "entryDate">,
): Promise<ScheduledChange[]> {
  try {
    const [data, programs] = await Promise.all([
      loadAdditionalDutyData(supabase, estimate.htsCode, estimate.entryDate),
      supabase.from("duty_programs").select("key, name"),
    ]);
    if (programs.error) throw programs.error;
    const names = new Map((programs.data ?? []).map((p) => [p.key as string, p.name as string]));
    // The review state read now, so a program reviewed since the estimate was
    // saved counts too.
    const reviewed = new Map(
      data.reviews.filter((r) => r.status === "reviewed").map((r) => [r.programKey, names.get(r.programKey) ?? r.programKey] as const),
    );
    return scheduledChanges({
      rows: data.schedule,
      reviewedPrograms: reviewed,
      originCountry: estimate.originCountry,
      htsCode: estimate.htsCode,
      entryDate: estimate.entryDate,
    });
  } catch (error) {
    console.error("loadScheduledChangesForEstimate error:", error);
    return [];
  }
}
