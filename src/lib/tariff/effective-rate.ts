import { daysBetween, REVIEW_STALE_AFTER_DAYS } from "./additional-duties";
import { toCents, parseDecimal } from "./rational";
import type { EstimateResult } from "./server-estimate";

// Display-only figures derived from an estimate (never stored, never fed back
// into a calculation), so they also work on saved estimates.

// Percent of the customs value, rounded half up to 0.1% from exact cents.
function tenthsPercent(amountCents: bigint, valueCents: bigint): string {
  const tenths = (amountCents * BigInt(2000) + valueCents) / (valueCents * BigInt(2));
  const negative = tenths < BigInt(0);
  const abs = negative ? -tenths : tenths;
  const whole = abs / BigInt(10);
  return `${negative ? "-" : ""}${whole}.${abs % BigInt(10)}%`;
}

export type EffectiveRates = { duties: string; allIn: string };

// Duties (base + additional) and the all-in total (with MPF and HMF) as a
// percentage of the customs value used. Null when there's no value to divide by.
export function effectiveRates(
  estimate: Pick<EstimateResult, "customsValueUsd" | "baseDutyUsd" | "additionalDutiesUsd" | "totalUsd">,
): EffectiveRates | null {
  const value = toCents(parseDecimal(estimate.customsValueUsd));
  if (value <= BigInt(0)) return null;
  const duties = toCents(parseDecimal(estimate.baseDutyUsd)) + toCents(parseDecimal(estimate.additionalDutiesUsd));
  const total = toCents(parseDecimal(estimate.totalUsd));
  return { duties: tenthsPercent(duties, value), allIn: tenthsPercent(total, value) };
}

export type OldestReview = { programName: string; days: number; stale: boolean; text: string };

// The longest-ago review among the programs counted in this estimate (a
// reviewed program with a line), measured to the day it was calculated.
export function oldestReview(
  estimate: Pick<EstimateResult, "dutyReviews" | "lines" | "asOfDate">,
): OldestReview | null {
  let oldest: { name: string; days: number } | null = null;
  for (const review of estimate.dutyReviews) {
    if (review.status !== "reviewed" || !review.reviewedAt) continue;
    if (!estimate.lines.some((l) => l.kind === "additional" && l.code === review.programKey)) continue;
    const days = Math.max(0, daysBetween(review.reviewedAt, estimate.asOfDate));
    if (!oldest || days > oldest.days || (days === oldest.days && review.name < oldest.name)) {
      oldest = { name: review.name, days };
    }
  }
  if (!oldest) return null;
  const ago = oldest.days === 0 ? "today" : oldest.days === 1 ? "1 day ago" : `${oldest.days} days ago`;
  return {
    programName: oldest.name,
    days: oldest.days,
    stale: oldest.days > REVIEW_STALE_AFTER_DAYS,
    text: `Oldest review: ${oldest.name}, ${ago}`,
  };
}
