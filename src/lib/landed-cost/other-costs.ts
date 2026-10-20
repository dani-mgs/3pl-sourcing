import { fromInteger } from "@/lib/tariff/rational";
import { allocateCents, type AllocationResult } from "./allocation";
import { parseCents } from "./money";

// Other costs: free-form lines (label + amount in USD), e.g. inland trucking,
// broker fee, insurance. They add to the landed cost but are never part of
// the customs value, so they never change the duty base or the MPF: nothing
// here is passed to the duty or fee calculations. Split across SKUs by
// entered value. Pure.

export const MAX_OTHER_COST_LINES = 20;
export const OTHER_COST_LABEL_MAX = 100;

export type OtherCostInput = { label: string; amountUsd: string };
export type OtherCost = { label: string; amountCents: bigint };

export type OtherCostsResult =
  | { ok: true; lines: OtherCost[]; totalCents: bigint }
  | { ok: false; error: string };

export function parseOtherCosts(lines: OtherCostInput[]): OtherCostsResult {
  if (lines.length > MAX_OTHER_COST_LINES) {
    return { ok: false, error: `Add at most ${MAX_OTHER_COST_LINES} other cost lines.` };
  }
  const parsed: OtherCost[] = [];
  for (const [i, line] of lines.entries()) {
    const label = line.label.trim();
    if (label.length < 1 || label.length > OTHER_COST_LABEL_MAX) {
      return { ok: false, error: `Other cost ${i + 1}: enter a label of 1 to ${OTHER_COST_LABEL_MAX} characters.` };
    }
    const amountCents = parseCents(line.amountUsd);
    if (amountCents == null) {
      return { ok: false, error: `Other cost "${label}": enter the amount in USD as 0 or more, e.g. 150.00.` };
    }
    parsed.push({ label, amountCents });
  }
  return { ok: true, lines: parsed, totalCents: parsed.reduce((acc, l) => acc + l.amountCents, BigInt(0)) };
}

// The total split across SKUs by their entered values (in cents).
export function allocateOtherCosts(totalCents: bigint, enteredValuesCents: bigint[]): AllocationResult {
  return allocateCents(totalCents, enteredValuesCents.map((v) => fromInteger(v)));
}
