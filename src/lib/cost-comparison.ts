export const COST_FIELDS = [
  "storage_cost",
  "pick_pack_cost",
  "receiving_cost",
  "returns_cost",
  "system_setup_cost",
  "inventory_on_request_cost",
  "adhoc_bundling_kitting_cost",
  "adhoc_labelling_cost",
  "b2b_pick_pack_cost",
] as const;

export const COST_SELECT =
  "currency, storage_cost, pick_pack_cost, receiving_cost, returns_cost, system_setup_cost, inventory_on_request_cost, adhoc_bundling_kitting_cost, adhoc_labelling_cost, b2b_pick_pack_cost";

type CostField = (typeof COST_FIELDS)[number];

export type CostInputs = { currency: string } & Record<CostField, number | null>;

export type BaselineStatus = "N/A" | "Pending" | "Ready";

export type SavingsState =
  | "baseline"
  | "value"
  | "pending"
  | "na"
  | "no-data"
  | "currency-mismatch";

export type CostComparisonRow<T> = {
  provider: T;
  has_cost_data: boolean;
  total_cost: number | null;
  cost_rank: number | null;
  savingsState: SavingsState;
  savings_vs_baseline: number | null;
  savings_pct: number | null;
  cost_position: string;
};

export function totalCost(provider: CostInputs): number | null {
  const costs = COST_FIELDS.map((field) => provider[field]);
  if (!costs.some((c) => c != null)) return null;
  return costs.reduce((sum: number, c) => sum + (c ?? 0), 0);
}

// Ranks by total cost ascending (rank 1 = cheapest). A ranking across
// different currencies would compare unconverted numbers, so if the
// costed providers don't share one currency, nothing is ranked.
export function rankByTotalCost<T extends CostInputs & { id: string }>(
  providers: T[],
): {
  rankById: Map<string, number>;
  mixedCurrencies: boolean;
  distinctCurrencies: string[];
} {
  const costed = providers
    .map((provider) => ({ provider, cost: totalCost(provider) }))
    .filter((entry): entry is { provider: T; cost: number } => entry.cost != null);

  const distinctCurrencies = Array.from(
    new Set(costed.map((entry) => entry.provider.currency)),
  );
  const mixedCurrencies = distinctCurrencies.length > 1;

  const rankById = new Map<string, number>();
  if (!mixedCurrencies) {
    [...costed]
      .sort((a, b) => a.cost - b.cost)
      .forEach((entry, i) => rankById.set(entry.provider.id, i + 1));
  }

  return { rankById, mixedCurrencies, distinctCurrencies };
}

// The baseline is the 3PL flagged is_incumbent (at most one per client):
// none flagged -> N/A, flagged without cost data -> Pending, flagged with
// cost data -> Ready.
export function buildCostComparison<
  T extends CostInputs & { id: string; is_incumbent: boolean },
>(
  providers: T[],
): {
  rows: CostComparisonRow<T>[];
  baselineStatus: BaselineStatus;
  mixedCurrencies: boolean;
  distinctCurrencies: string[];
} {
  const { rankById, mixedCurrencies, distinctCurrencies } =
    rankByTotalCost(providers);

  const incumbent = providers.find((p) => p.is_incumbent);
  const incumbentTotal = incumbent ? totalCost(incumbent) : null;

  let baselineStatus: BaselineStatus;
  if (!incumbent) {
    baselineStatus = "N/A";
  } else if (incumbentTotal != null) {
    baselineStatus = "Ready";
  } else {
    baselineStatus = "Pending";
  }

  const rows = providers.map((provider): CostComparisonRow<T> => {
    const total_cost = totalCost(provider);
    const has_cost_data = total_cost != null;

    let savingsState: SavingsState;
    let savings_vs_baseline: number | null = null;
    let savings_pct: number | null = null;
    let cost_position: string;

    if (!has_cost_data) {
      savingsState = "no-data";
      cost_position = "Not enough data";
    } else if (baselineStatus === "N/A") {
      savingsState = "na";
      cost_position = "N/A";
    } else if (baselineStatus === "Pending") {
      savingsState = "pending";
      cost_position = "Pending";
    } else if (provider.is_incumbent) {
      savingsState = "baseline";
      cost_position = "Baseline";
    } else if (mixedCurrencies) {
      savingsState = "currency-mismatch";
      cost_position = "Currency Mismatch";
    } else {
      const diff = incumbentTotal! - total_cost;
      savingsState = "value";
      savings_vs_baseline = diff;
      savings_pct = incumbentTotal !== 0 ? (diff / incumbentTotal!) * 100 : null;
      cost_position =
        diff > 0 ? "Beats Baseline" : diff === 0 ? "Matches Baseline" : "Above Baseline";
    }

    return {
      provider,
      has_cost_data,
      total_cost,
      cost_rank: rankById.get(provider.id) ?? null,
      savingsState,
      savings_vs_baseline,
      savings_pct,
      cost_position,
    };
  });

  return { rows, baselineStatus, mixedCurrencies, distinctCurrencies };
}
