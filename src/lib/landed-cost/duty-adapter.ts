import { centsToRational, toFixed } from "@/lib/tariff/rational";
import type { LineDutyResult, LineError } from "./duty-request";
import type { ScenarioSkuInput } from "./scenario-totals";

// Turns one line of the batch duty loader into the duty fields
// computeScenarioTotals takes. Duties from the engine are never manual or
// placeholders, so those flags are false (manual rates arrive in Phase 3).
// Pure.

export type SkuDutyFields = Pick<ScenarioSkuInput, "dutiesUsd" | "dutiesIncomplete" | "includesManualRate" | "unverified">;

export function toScenarioSkuDuty(result: LineDutyResult): { ok: true; lineId: string; fields: SkuDutyFields } | LineError {
  if (!result.ok) return result;
  return {
    ok: true,
    lineId: result.lineId,
    fields: {
      dutiesUsd: toFixed(centsToRational(result.duty.dutiesCents), 2),
      dutiesIncomplete: result.duty.incomplete,
      includesManualRate: false,
      unverified: false,
    },
  };
}
