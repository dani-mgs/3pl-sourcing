import { describe, expect, test } from "vitest";
import { COST_FIELDS, type CostInputs } from "@/lib/cost-comparison";
import { rankProviders } from "./recommendation-ranking";

// The Recommendation page highlights the first three entries of `ranked`.

const BLANK = Object.fromEntries(COST_FIELDS.map((f) => [f, null])) as Record<
  (typeof COST_FIELDS)[number],
  null
>;

function provider(id: string, storage: number | null, currency = "USD"): CostInputs & { id: string } {
  return { id, currency, ...BLANK, storage_cost: storage };
}

const providers = [
  provider("no-cost", null),
  provider("dear", 900),
  provider("cheap", 100),
  provider("mid", 500),
];

describe("rankProviders", () => {
  test("Cost Savings: cheapest first, then unranked in their original order", () => {
    const { ranked, mixedCurrencies } = rankProviders(providers, "Cost Savings");
    expect(ranked.map((r) => [r.provider.id, r.rank])).toEqual([
      ["cheap", 1],
      ["mid", 2],
      ["dear", 3],
      ["no-cost", null],
    ]);
    expect(mixedCurrencies).toBe(false);
  });

  test("Cost Savings with mixed currencies: nothing ranked, original order kept", () => {
    const { ranked, mixedCurrencies, distinctCurrencies } = rankProviders(
      [provider("a", 900), provider("b", 100, "EUR")],
      "Cost Savings",
    );
    expect(mixedCurrencies).toBe(true);
    expect(distinctCurrencies.sort()).toEqual(["EUR", "USD"]);
    expect(ranked.map((r) => [r.provider.id, r.rank])).toEqual([
      ["a", null],
      ["b", null],
    ]);
  });

  test.each(["Quality of Service", "Turnaround Time"] as const)(
    "%s: no ranks, original order (the top three are simply the first three)",
    (priority) => {
      const { ranked } = rankProviders(providers, priority);
      expect(ranked.map((r) => r.provider.id)).toEqual(["no-cost", "dear", "cheap", "mid"]);
      expect(ranked.every((r) => r.rank === null)).toBe(true);
    },
  );
});
