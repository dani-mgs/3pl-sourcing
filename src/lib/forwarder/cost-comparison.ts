// Forwarder cost comparison: the calculations behind the Freight Cost
// Comparison, ported from the original spreadsheet ('3 Freight Cost
// Comparison') and verified against its formulas in
// cost-comparison.test.ts. Pure functions — no database access.
//
// Ranking and savings use Freight Cost only, NOT Total Comparable Logistics
// Cost. That matches the spreadsheet and is a deliberate, still-open decision
// (see docs/TECH_DEBT.md, "Forwarder ranking basis").

export const NOT_COMPARABLE = "Not Comparable" as const;
export type NotComparable = typeof NOT_COMPARABLE;

const INCOMPLETE = "Incomplete / Needs Clarification";

// Forwarders with these statuses are out of the running, so their quotes are
// left out of ranking (a deliberate change from the spreadsheet). Exact
// strings from the forwarders_status_check constraint.
export const RANKING_EXCLUDED_STATUSES: readonly string[] = [
  "Unfit",
  "Do Not Contact",
  "Withdrawn / No Response",
];

export type ForwarderProjectTerms = {
  // Current terms: the baseline that savings are measured against.
  current_incoterm: string | null;
  shipment_mode: string | null;
  shipment_type: string | null;
  current_freight_cost_usd: number | null;
  // Final agreed terms: what quotes are ranked on.
  final_incoterm: string | null;
  final_shipment_mode: string | null;
  final_shipment_type: string | null;
  shipments_per_month: number | null;
  shipments_per_year: number | null;
};

export type ForwarderQuoteInput = {
  shipment_mode: string | null;
  shipment_type: string | null;
  incoterm: string | null;
  actual_weight_kg: number | null;
  chargeable_weight_kg: number | null;
  cost_of_goods_usd: number | null;
  original_currency: string;
  original_amount: number | null;
  exchange_rate_to_usd: number;
  duties_taxes_usd: number | null;
  other_charges_usd: number | null;
  quote_completeness: string | null;
  // A quote from a forwarder in RANKING_EXCLUDED_STATUSES isn't ranked.
  forwarder_status?: string | null;
};

export type VsBaseline =
  | "Below Baseline"
  | "Equal to Baseline"
  | "Above Baseline";

export type RankPosition =
  | "Only Comparable Quote"
  | "Lowest Freight Cost"
  | "Highest Freight Cost";

export type ForwarderQuoteResult<Q extends ForwarderQuoteInput> = {
  quote: Q;
  freightCostUsd: number | null;
  costPerKg: number | null;
  freightCostRatio: number | null;
  totalComparableLogisticsCost: number | null;
  estimatedAnnualFreightCost: number | null;
  // Savings: NOT_COMPARABLE when the savings gate fails; null when the gate
  // passes but a value can't be worked out (no baseline, no annual volume,
  // or a zero divisor).
  costDifference: number | NotComparable | null;
  savingPct: number | NotComparable | null;
  annualCostDifference: number | NotComparable | null;
  annualSavingsPct: number | NotComparable | null;
  vsBaseline: VsBaseline | NotComparable | null;
  // Ranking: NOT_COMPARABLE when the ranking gate fails (this wins over an
  // excluded status). Both are null when the forwarder's status excludes it
  // from ranking; rankPosition is also null for a middle rank (shown as "—").
  costRank: number | NotComparable | null;
  rankPosition: RankPosition | NotComparable | null;
};

export type ForwarderCostComparison<Q extends ForwarderQuoteInput> = {
  effectiveAnnualShipments: number | null;
  results: ForwarderQuoteResult<Q>[];
};

// Money is compared in whole cents. toPrecision(15) drops binary noise
// first, so 50000 × 0.14 (7000.000000000001) is exactly 700000 cents.
function toCents(value: number): number {
  return Math.round(Number((value * 100).toPrecision(15)));
}

export function roundToCents(value: number): number {
  return toCents(value) / 100;
}

function divide(numerator: number, denominator: number | null): number | null {
  if (denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export function freightCostUsd(quote: ForwarderQuoteInput): number | null {
  if (quote.original_amount == null) return null;
  const usd =
    quote.original_currency === "USD"
      ? quote.original_amount
      : quote.original_amount * quote.exchange_rate_to_usd;
  return roundToCents(usd);
}

export function effectiveAnnualShipments(
  project: ForwarderProjectTerms,
): number | null {
  if (project.shipments_per_year != null) return project.shipments_per_year;
  if (project.shipments_per_month != null) return project.shipments_per_month * 12;
  return null;
}

function matchesTerms(
  quote: ForwarderQuoteInput,
  incoterm: string | null,
  mode: string | null,
  type: string | null,
): boolean {
  return (
    incoterm != null &&
    mode != null &&
    type != null &&
    quote.incoterm === incoterm &&
    quote.shipment_mode === mode &&
    quote.shipment_type === type &&
    quote.quote_completeness !== INCOMPLETE
  );
}

// Savings gate: same terms as the project's CURRENT shipment.
export function passesSavingsGate(
  quote: ForwarderQuoteInput,
  project: ForwarderProjectTerms,
): boolean {
  return matchesTerms(
    quote,
    project.current_incoterm,
    project.shipment_mode,
    project.shipment_type,
  );
}

export function isExcludedFromRanking(quote: ForwarderQuoteInput): boolean {
  return (
    quote.forwarder_status != null &&
    RANKING_EXCLUDED_STATUSES.includes(quote.forwarder_status)
  );
}

// Ranking gate: same terms as the project's FINAL AGREED shipment. If the
// final terms aren't set, nothing passes.
export function passesRankingGate(
  quote: ForwarderQuoteInput,
  project: ForwarderProjectTerms,
): boolean {
  return matchesTerms(
    quote,
    project.final_incoterm,
    project.final_shipment_mode,
    project.final_shipment_type,
  );
}

// True when the quote can't be ranked because its terms differ from the
// project's final terms: all three final terms are set, the quote states all
// three of its own, and they don't all match. (A quote that is only missing a
// term, or is marked incomplete, is "Not Comparable" for a different reason.)
export function hasDifferentTerms(
  quote: ForwarderQuoteInput,
  project: Pick<
    ForwarderProjectTerms,
    "final_incoterm" | "final_shipment_mode" | "final_shipment_type"
  >,
): boolean {
  const { final_incoterm, final_shipment_mode, final_shipment_type } = project;
  if (final_incoterm == null || final_shipment_mode == null || final_shipment_type == null) {
    return false;
  }
  if (quote.incoterm == null || quote.shipment_mode == null || quote.shipment_type == null) {
    return false;
  }
  return (
    quote.incoterm !== final_incoterm ||
    quote.shipment_mode !== final_shipment_mode ||
    quote.shipment_type !== final_shipment_type
  );
}

export function buildForwarderCostComparison<Q extends ForwarderQuoteInput>(
  project: ForwarderProjectTerms,
  quotes: Q[],
): ForwarderCostComparison<Q> {
  const annualShipments = effectiveAnnualShipments(project);
  const baseline = project.current_freight_cost_usd;

  const priced = quotes.map((quote) => ({
    quote,
    freight: freightCostUsd(quote),
    rankable: passesRankingGate(quote, project),
    excluded: isExcludedFromRanking(quote),
  }));

  // Freight costs (in cents) of every eligible quote. One pool for the whole
  // project: what's eligible is decided only by the final-terms gate, so every
  // ranked quote already has the same incoterm, mode and type.
  const rankPool: number[] = [];
  for (const { freight, rankable, excluded } of priced) {
    if (!rankable || excluded || freight == null) continue;
    rankPool.push(toCents(freight));
  }

  const results = priced.map(({ quote, freight, rankable, excluded }) => {
    const result: ForwarderQuoteResult<Q> = {
      quote,
      freightCostUsd: freight,
      costPerKg: null,
      freightCostRatio: null,
      totalComparableLogisticsCost: null,
      estimatedAnnualFreightCost: null,
      costDifference: null,
      savingPct: null,
      annualCostDifference: null,
      annualSavingsPct: null,
      vsBaseline: null,
      costRank: null,
      rankPosition: null,
    };

    if (freight != null) {
      const weight =
        quote.shipment_mode === "Air" && quote.chargeable_weight_kg != null
          ? quote.chargeable_weight_kg
          : quote.actual_weight_kg;
      result.costPerKg = divide(freight, weight);
      result.freightCostRatio = divide(freight, quote.cost_of_goods_usd);
      result.totalComparableLogisticsCost =
        freight + (quote.duties_taxes_usd ?? 0) + (quote.other_charges_usd ?? 0);
      if (annualShipments != null) {
        result.estimatedAnnualFreightCost = freight * annualShipments;
      }
    }

    if (!passesSavingsGate(quote, project)) {
      result.costDifference = NOT_COMPARABLE;
      result.savingPct = NOT_COMPARABLE;
      result.annualCostDifference = NOT_COMPARABLE;
      result.annualSavingsPct = NOT_COMPARABLE;
      result.vsBaseline = NOT_COMPARABLE;
    } else if (freight != null && baseline != null) {
      const diffCents = toCents(baseline) - toCents(freight);
      const difference = diffCents / 100;
      result.costDifference = difference;
      result.savingPct = divide(difference, baseline);
      result.vsBaseline =
        diffCents > 0
          ? "Below Baseline"
          : diffCents === 0
            ? "Equal to Baseline"
            : "Above Baseline";
      if (annualShipments != null) {
        result.annualCostDifference = difference * annualShipments;
        result.annualSavingsPct = divide(
          result.annualCostDifference,
          baseline * annualShipments,
        );
      }
    }

    if (!rankable) {
      result.costRank = NOT_COMPARABLE;
      result.rankPosition = NOT_COMPARABLE;
    } else if (!excluded && freight != null) {
      const pool = rankPool;
      const cents = toCents(freight);
      const cheaper = pool.filter((other) => other < cents).length;
      const dearer = pool.filter((other) => other > cents).length;
      result.costRank = 1 + cheaper;
      // Ties are symmetric: every tied-lowest quote is Lowest and every
      // tied-highest is Highest. An all-equal group checks Lowest first.
      result.rankPosition =
        pool.length === 1
          ? "Only Comparable Quote"
          : cheaper === 0
            ? "Lowest Freight Cost"
            : dearer === 0
              ? "Highest Freight Cost"
              : null;
    }

    return result;
  });

  return { effectiveAnnualShipments: annualShipments, results };
}
