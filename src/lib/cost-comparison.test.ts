import { describe, expect, test } from "vitest";
import {
  COST_FIELDS,
  buildCostComparison,
  rankByTotalCost,
  totalCost,
  type CostInputs,
} from "./cost-comparison";

// 3PL cost comparison: totals, the incumbent baseline (N/A / Pending / Ready),
// currency mismatch, and rank order. Each case is a small hand-checked
// fixture; expected figures are written out, not recomputed.

type Provider = CostInputs & { id: string; is_incumbent: boolean };

const BLANK_COSTS = Object.fromEntries(COST_FIELDS.map((f) => [f, null])) as Record<
  (typeof COST_FIELDS)[number],
  null
>;

function provider(
  id: string,
  costs: Partial<Record<(typeof COST_FIELDS)[number], number>> = {},
  options: { currency?: string; incumbent?: boolean } = {},
): Provider {
  return {
    id,
    currency: options.currency ?? "USD",
    is_incumbent: options.incumbent ?? false,
    ...BLANK_COSTS,
    ...costs,
  };
}

function row(result: ReturnType<typeof buildCostComparison<Provider>>, id: string) {
  const found = result.rows.find((r) => r.provider.id === id);
  if (!found) throw new Error(`no row for ${id}`);
  return found;
}

describe("totalCost", () => {
  test("sums all nine cost fields", () => {
    const all = Object.fromEntries(COST_FIELDS.map((f, i) => [f, i + 1]));
    expect(totalCost(provider("a", all))).toBe(45);
  });

  test("blank fields count as 0 when at least one is set", () => {
    expect(totalCost(provider("a", { storage_cost: 1200, pick_pack_cost: 800.5 }))).toBe(2000.5);
    expect(totalCost(provider("a", { returns_cost: 0 }))).toBe(0);
  });

  test("every field blank: no total (not 0)", () => {
    expect(totalCost(provider("a"))).toBeNull();
  });
});

describe("baseline status", () => {
  test("no incumbent: N/A for every costed row, no savings", () => {
    const result = buildCostComparison([
      provider("a", { storage_cost: 100 }),
      provider("b", { storage_cost: 200 }),
    ]);
    expect(result.baselineStatus).toBe("N/A");
    for (const id of ["a", "b"]) {
      expect(row(result, id)).toMatchObject({
        savingsState: "na",
        cost_position: "N/A",
        savings_vs_baseline: null,
        savings_pct: null,
      });
    }
  });

  test("incumbent with no cost data: Pending for every costed row, including ranks", () => {
    const result = buildCostComparison([
      provider("inc", {}, { incumbent: true }),
      provider("a", { storage_cost: 100 }),
    ]);
    expect(result.baselineStatus).toBe("Pending");
    expect(row(result, "a")).toMatchObject({ savingsState: "pending", cost_position: "Pending", cost_rank: 1 });
    expect(row(result, "inc")).toMatchObject({
      savingsState: "no-data",
      cost_position: "Not enough data",
      total_cost: null,
      cost_rank: null,
    });
  });

  test("incumbent with costs: Ready; its own row is the Baseline", () => {
    const result = buildCostComparison([
      provider("inc", { storage_cost: 1000 }, { incumbent: true }),
      provider("a", { storage_cost: 800 }),
    ]);
    expect(result.baselineStatus).toBe("Ready");
    expect(row(result, "inc")).toMatchObject({
      savingsState: "baseline",
      cost_position: "Baseline",
      savings_vs_baseline: null,
    });
  });
});

describe("savings against the incumbent", () => {
  const result = buildCostComparison([
    provider("inc", { storage_cost: 1000 }, { incumbent: true }),
    provider("cheaper", { storage_cost: 750 }),
    provider("same", { storage_cost: 600, pick_pack_cost: 400 }),
    provider("dearer", { storage_cost: 1250 }),
  ]);

  test("cheaper beats the baseline: positive savings and %", () => {
    expect(row(result, "cheaper")).toMatchObject({
      savingsState: "value",
      savings_vs_baseline: 250,
      savings_pct: 25,
      cost_position: "Beats Baseline",
    });
  });

  test("an equal total matches the baseline", () => {
    expect(row(result, "same")).toMatchObject({
      savings_vs_baseline: 0,
      savings_pct: 0,
      cost_position: "Matches Baseline",
    });
  });

  test("dearer is above the baseline: negative savings", () => {
    expect(row(result, "dearer")).toMatchObject({
      savings_vs_baseline: -250,
      savings_pct: -25,
      cost_position: "Above Baseline",
    });
  });

  test("an incumbent total of 0 gives savings but no %", () => {
    const zero = buildCostComparison([
      provider("inc", { storage_cost: 0 }, { incumbent: true }),
      provider("a", { storage_cost: 50 }),
    ]);
    expect(row(zero, "a")).toMatchObject({ savings_vs_baseline: -50, savings_pct: null });
  });

  test("a provider with no costs is Not enough data, whatever the baseline", () => {
    const withBlank = buildCostComparison([
      provider("inc", { storage_cost: 1000 }, { incumbent: true }),
      provider("blank"),
    ]);
    expect(row(withBlank, "blank")).toMatchObject({
      has_cost_data: false,
      savingsState: "no-data",
      cost_position: "Not enough data",
      cost_rank: null,
    });
  });
});

describe("currency mismatch", () => {
  test("costed providers in different currencies: Currency Mismatch and nothing ranked", () => {
    const result = buildCostComparison([
      provider("inc", { storage_cost: 1000 }, { incumbent: true, currency: "USD" }),
      provider("eur", { storage_cost: 500 }, { currency: "EUR" }),
      provider("usd", { storage_cost: 900 }, { currency: "USD" }),
    ]);
    expect(result.mixedCurrencies).toBe(true);
    expect(result.distinctCurrencies.sort()).toEqual(["EUR", "USD"]);
    expect(row(result, "eur")).toMatchObject({
      savingsState: "currency-mismatch",
      cost_position: "Currency Mismatch",
      savings_vs_baseline: null,
    });
    expect(row(result, "usd").cost_position).toBe("Currency Mismatch");
    expect(row(result, "inc").cost_position).toBe("Baseline");
    expect(result.rows.map((r) => r.cost_rank)).toEqual([null, null, null]);
  });

  test("a provider without costs doesn't count towards the currency mix", () => {
    const result = buildCostComparison([
      provider("inc", { storage_cost: 1000 }, { incumbent: true }),
      provider("eur-blank", {}, { currency: "EUR" }),
      provider("a", { storage_cost: 900 }),
    ]);
    expect(result.mixedCurrencies).toBe(false);
    expect(row(result, "a").cost_position).toBe("Beats Baseline");
  });
});

describe("rank order", () => {
  test("ascending by total, cheapest is 1; unranked providers have no rank", () => {
    const result = buildCostComparison([
      provider("mid", { storage_cost: 500 }),
      provider("blank"),
      provider("high", { storage_cost: 900 }),
      provider("low", { storage_cost: 100, pick_pack_cost: 100 }),
    ]);
    const ranks = Object.fromEntries(result.rows.map((r) => [r.provider.id, r.cost_rank]));
    expect(ranks).toEqual({ low: 1, mid: 2, high: 3, blank: null });
  });

  test("the incumbent is ranked alongside everyone else", () => {
    const { rankById } = rankByTotalCost([
      provider("inc", { storage_cost: 300 }, { incumbent: true }),
      provider("a", { storage_cost: 200 }),
    ]);
    expect(rankById.get("a")).toBe(1);
    expect(rankById.get("inc")).toBe(2);
  });

  // Current behaviour, pinned so a change is deliberate: equal totals get
  // consecutive ranks in input order (TECH_DEBT: no 3PL tie handling).
  test("ties get consecutive ranks in input order (no tie handling yet)", () => {
    const { rankById } = rankByTotalCost([
      provider("first", { storage_cost: 500 }),
      provider("second", { storage_cost: 500 }),
    ]);
    expect(rankById.get("first")).toBe(1);
    expect(rankById.get("second")).toBe(2);
  });
});
