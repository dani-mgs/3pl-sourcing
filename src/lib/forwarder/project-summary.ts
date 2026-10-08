// Display-side derivations for the Forwarder Project Summary page (summary
// tiles and quote comparison extras). Pure functions over results that
// cost-comparison.ts already produces — no ranking or savings logic here.

import {
  NOT_COMPARABLE,
  RANKING_EXCLUDED_STATUSES,
  roundToCents,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "./cost-comparison";

export type BestQuotes<Q extends ForwarderQuoteInput> = {
  // Every quote tied for the lowest eligible freight cost; empty when none.
  best: ForwarderQuoteResult<Q>[];
};

// Eligible = has a numeric cost rank, i.e. passed the ranking gate (final
// terms), isn't from an excluded forwarder, and has a freight cost.
export function pickBestQuotes<Q extends ForwarderQuoteInput>(
  results: ForwarderQuoteResult<Q>[],
): BestQuotes<Q> {
  const eligible = results.filter(
    (r) => typeof r.costRank === "number" && r.freightCostUsd != null,
  );
  if (eligible.length === 0) return { best: [] };

  const lowest = Math.min(...eligible.map((r) => roundToCents(r.freightCostUsd!)));
  const best = eligible.filter((r) => roundToCents(r.freightCostUsd!) === lowest);
  return { best };
}

// Freight as a share of the project's invoice value. Only in USD: the project
// has no exchange rate, so a non-USD invoice can't be compared to USD freight.
// The same denominator is used for current and quoted freight so the two
// ratios differ only by freight.
export function freightInvoiceRatio(
  freightUsd: number | null,
  invoiceValue: number | null,
  invoiceCurrency: string | null,
): number | null {
  if (freightUsd == null || invoiceValue == null || invoiceCurrency !== "USD") return null;
  if (invoiceValue <= 0) return null;
  return freightUsd / invoiceValue;
}

const dayFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// "22 d", "18–25 d", or null when neither end is set.
export function leadTimeRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min == null || max == null || min === max) {
    return `${dayFormat.format((min ?? max)!)} d`;
  }
  return `${dayFormat.format(min)}–${dayFormat.format(max)} d`;
}

// Misses the target when the slowest stated lead time is over it.
export function exceedsTargetLeadTime(
  min: number | null,
  max: number | null,
  target: number | null,
): boolean {
  const slowest = max ?? min;
  if (slowest == null || target == null) return false;
  return slowest > target;
}

export type RateValidity =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "soon"; daysLeft: number }
  | { kind: "ok" };

export const RATE_EXPIRY_WARNING_DAYS = 7;

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// Both dates are "YYYY-MM-DD". Expires today counts as "soon" with 0 days.
export function rateValidity(validUntil: string | null, today: string): RateValidity {
  if (!validUntil) return { kind: "none" };
  const daysLeft = dayNumber(validUntil) - dayNumber(today);
  if (daysLeft < 0) return { kind: "expired" };
  if (daysLeft <= RATE_EXPIRY_WARNING_DAYS) return { kind: "soon", daysLeft };
  return { kind: "ok" };
}

// Upper bound for the cost bars: the most expensive quote or the baseline,
// whichever is larger, so the baseline marker always fits.
export function costBarScale(
  freights: (number | null)[],
  baseline: number | null,
): number | null {
  const values = [...freights, baseline].filter((v): v is number => v != null && v > 0);
  return values.length ? Math.max(...values) : null;
}

// The bar scale for a whole project's quotes. It covers the quotes that were
// eligible for the ranking gate (so quotes with other terms don't stretch it,
// and the ranked quotes' bars read the same as they always have); when no quote
// is eligible, every quote with a price is used so bars still show.
export function projectBarScale<Q extends ForwarderQuoteInput>(
  results: ForwarderQuoteResult<Q>[],
  baseline: number | null,
): number | null {
  const gated = results.filter((r) => r.costRank !== NOT_COMPARABLE);
  const pool = gated.length > 0 ? gated : results;
  return costBarScale(
    pool.map((r) => r.freightCostUsd),
    baseline,
  );
}

// Display order for the quotes table: ranked quotes by rank, then quotes that
// passed the terms gate but have no rank (excluded forwarder, no price), then
// quotes that were never ranked because their terms differ or are incomplete.
// Unranked quotes go cheapest first (unpriced last); equal keys keep their
// input order.
export function displayTier<Q extends ForwarderQuoteInput>(r: ForwarderQuoteResult<Q>): number {
  if (typeof r.costRank === "number") return 0;
  return r.costRank === NOT_COMPARABLE ? 2 : 1;
}

export function sortForDisplay<Q extends ForwarderQuoteInput>(
  results: ForwarderQuoteResult<Q>[],
): ForwarderQuoteResult<Q>[] {
  return [...results].sort((a, b) => {
    const tier = displayTier(a) - displayTier(b);
    if (tier !== 0) return tier;
    if (typeof a.costRank === "number" && typeof b.costRank === "number") {
      return a.costRank - b.costRank;
    }
    return (a.freightCostUsd ?? Infinity) - (b.freightCostUsd ?? Infinity);
  });
}

export type PipelineCounts = { total: number; quoted: number; excluded: number };

export function pipelineCounts(
  forwarders: { id: string; status: string }[],
  quotes: { forwarder_id: string }[],
): PipelineCounts {
  const quotedIds = new Set(quotes.map((q) => q.forwarder_id));
  return {
    total: forwarders.length,
    quoted: forwarders.filter((f) => quotedIds.has(f.id)).length,
    excluded: forwarders.filter((f) => RANKING_EXCLUDED_STATUSES.includes(f.status)).length,
  };
}

export type QuotePosition<Q extends ForwarderQuoteInput> = {
  rank: number;
  // Ranked quotes in the project, across every forwarder.
  rankedInProject: number;
  // Other quotes in the project on the same rank.
  tiedWith: ForwarderQuoteResult<Q>[];
};

// Where one quote stands among the project's ranked quotes. `all` must be the
// whole project's results so the count covers every forwarder. Null when the
// quote isn't ranked.
export function quotePosition<Q extends ForwarderQuoteInput>(
  all: ForwarderQuoteResult<Q>[],
  target: ForwarderQuoteResult<Q>,
): QuotePosition<Q> | null {
  if (typeof target.costRank !== "number") return null;
  const ranked = all.filter((r) => typeof r.costRank === "number");
  return {
    rank: target.costRank,
    rankedInProject: ranked.length,
    tiedWith: ranked.filter((r) => r !== target && r.costRank === target.costRank),
  };
}

// The cheapest priced quote regardless of ranking, for a forwarder whose
// quotes aren't ranked (excluded, or terms don't match). Null if none priced.
export function lowestFreightQuote<Q extends ForwarderQuoteInput>(
  results: ForwarderQuoteResult<Q>[],
): ForwarderQuoteResult<Q> | null {
  let lowest: ForwarderQuoteResult<Q> | null = null;
  for (const r of results) {
    if (r.freightCostUsd == null) continue;
    if (lowest == null || r.freightCostUsd < lowest.freightCostUsd!) lowest = r;
  }
  return lowest;
}
