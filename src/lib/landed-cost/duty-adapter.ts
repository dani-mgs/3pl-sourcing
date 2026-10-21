import { centsToRational, toFixed } from "@/lib/tariff/rational";
import type { LineDutyResult, LineError } from "./duty-request";
import type { ScenarioSkuInput } from "./scenario-totals";

// Turns one line of the batch duty loader into the duty fields
// computeScenarioTotals takes: the duties after any manual rates
// (manual-rates.ts), flagged when one applies. Never placeholders. Pure.

export type SkuDutyFields = Pick<ScenarioSkuInput, "dutiesUsd" | "dutiesIncomplete" | "includesManualRate" | "unverified">;

export function toScenarioSkuDuty(result: LineDutyResult, includesManualRate = false): { ok: true; lineId: string; fields: SkuDutyFields } | LineError {
  if (!result.ok) return result;
  return {
    ok: true,
    lineId: result.lineId,
    fields: {
      dutiesUsd: toFixed(centsToRational(result.duty.dutiesCents), 2),
      dutiesIncomplete: result.duty.incomplete,
      includesManualRate,
      unverified: false,
    },
  };
}
