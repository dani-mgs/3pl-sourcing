import { rankByTotalCost, type CostInputs } from "@/lib/cost-comparison";

// Orders the Vetted 3PLs on the Recommendation page; the page highlights the
// first three. Moved out of recommendation-form.tsx unchanged so it can be
// unit tested.

export const PRIORITY_OPTIONS = [
  "Cost Savings",
  "Quality of Service",
  "Turnaround Time",
] as const;

export type Priority = (typeof PRIORITY_OPTIONS)[number];

// Cost Savings: ranked by total cost (cheapest first), then everyone without
// a rank (no cost data, or mixed currencies) in their original order. Any
// other priority can't be ranked automatically, so the order is unchanged and
// nothing gets a rank.
export function rankProviders<T extends CostInputs & { id: string }>(
  providers: T[],
  priority: Priority,
): {
  ranked: { provider: T; rank: number | null }[];
  mixedCurrencies: boolean;
  distinctCurrencies: string[];
} {
  if (priority !== "Cost Savings") {
    return {
      ranked: providers.map((provider) => ({ provider, rank: null })),
      mixedCurrencies: false,
      distinctCurrencies: [],
    };
  }

  const { rankById, mixedCurrencies, distinctCurrencies } =
    rankByTotalCost(providers);
  const withRank = providers.map((provider) => ({
    provider,
    rank: rankById.get(provider.id) ?? null,
  }));
  const ranked = [
    ...withRank
      .filter((entry) => entry.rank != null)
      .sort((a, b) => a.rank! - b.rank!),
    ...withRank.filter((entry) => entry.rank == null),
  ];
  return { ranked, mixedCurrencies, distinctCurrencies };
}
