import { describe, expect, test } from "vitest";
import golden from "./__fixtures__/forwarder-cost-comparison.golden.json";
import {
  NOT_COMPARABLE,
  RANKING_EXCLUDED_STATUSES,
  buildForwarderCostComparison,
  hasDifferentTerms,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "./cost-comparison";

// The golden fixture holds values computed by the original spreadsheet's
// formulas. It is the source of truth: if a value here disagrees, the module
// is wrong, not the fixture.

const TOLERANCE = 0.0001;

type Expected = Record<string, number | string>;
type GoldenQuote = {
  // scenario_group is the spreadsheet's own grouping column (not used by the app).
  input: ForwarderQuoteInput & { provider: string; scenario_group: string };
  expected: Expected;
};
type GoldenConfig = {
  project: ForwarderProjectTerms & { effective_annual_shipments_expected: number };
  quotes: GoldenQuote[];
};

const configs = golden.configs as unknown as Record<string, GoldenConfig>;

// Fixture column -> result field, for every value compared number-or-string.
const FIELDS: [string, keyof ForwarderQuoteResult<ForwarderQuoteInput>][] = [
  ["freight_cost_usd", "freightCostUsd"],
  ["cost_per_kg", "costPerKg"],
  ["freight_cost_ratio", "freightCostRatio"],
  ["total_comparable_logistics_cost", "totalComparableLogisticsCost"],
  ["cost_difference_vs_baseline", "costDifference"],
  ["cost_saving_pct", "savingPct"],
  ["estimated_annual_freight_cost", "estimatedAnnualFreightCost"],
  ["estimated_annual_cost_difference", "annualCostDifference"],
  ["estimated_annual_savings_pct", "annualSavingsPct"],
  ["cost_rank", "costRank"],
];

const RANK_PHRASES = new Set([
  "Lowest Freight Cost",
  "Highest Freight Cost",
  "Only Comparable Quote",
]);

function expectValue(actual: unknown, expected: number | string, label: string) {
  if (typeof expected === "string") {
    expect.soft(actual, label).toBe(expected);
  } else {
    expect.soft(typeof actual, `${label} is a number`).toBe("number");
    expect.soft(actual as number, label).toBeCloseTo(expected, 4);
    expect
      .soft(Math.abs((actual as number) - expected), `${label} within ${TOLERANCE}`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
}

// The spreadsheet ranks within its own "scenario" column, while the app now
// ranks every eligible quote in a project together. The two agree when the pool
// is one spreadsheet group, so the fixture is run one group at a time (each run
// is exactly what the app does for a project holding only that group's quotes).
// How pooling differs from the spreadsheet is covered by "one ranking pool".
function runByGroup(project: ForwarderProjectTerms, quotes: GoldenQuote[]) {
  const results: ForwarderQuoteResult<ForwarderQuoteInput>[] = new Array(quotes.length);
  let effectiveAnnualShipments: number | null = null;
  const groups = [...new Set(quotes.map((q) => q.input.scenario_group))];
  for (const group of groups) {
    const indexes = quotes.flatMap((q, i) => (q.input.scenario_group === group ? [i] : []));
    const run = buildForwarderCostComparison(
      project,
      indexes.map((i) => quotes[i].input),
    );
    effectiveAnnualShipments = run.effectiveAnnualShipments;
    run.results.forEach((r, k) => (results[indexes[k]] = r));
  }
  return { effectiveAnnualShipments, results };
}

describe.each(Object.entries(configs))("golden fixture: %s", (name, config) => {
  const { effective_annual_shipments_expected, ...project } = config.project;
  const comparison = runByGroup(project, config.quotes);

  test("effective annual shipments", () => {
    expect(comparison.effectiveAnnualShipments).toBe(
      effective_annual_shipments_expected,
    );
  });

  test.each(config.quotes.map((q, i) => [q.input.provider, i] as const))(
    "%s",
    (provider, i) => {
      const expected = config.quotes[i].expected;
      const result = comparison.results[i];
      const at = `${name} / ${provider}`;

      for (const [column, field] of FIELDS) {
        expectValue(result[field], expected[column], `${at}: ${column}`);
      }

      // cost_position is the spreadsheet's old single column. A rank phrase
      // must match rankPosition; a baseline phrase means no rank label.
      const position = expected.cost_position as string;
      if (position === NOT_COMPARABLE || RANK_PHRASES.has(position)) {
        expect.soft(result.rankPosition, `${at}: rankPosition`).toBe(position);
      } else {
        expect.soft(result.rankPosition, `${at}: rankPosition`).toBeNull();
      }

      // vsBaseline is Not Comparable exactly when the difference is, and
      // otherwise follows the difference's sign.
      const diff = expected.cost_difference_vs_baseline;
      if (diff === NOT_COMPARABLE) {
        expect.soft(result.vsBaseline, `${at}: vsBaseline`).toBe(NOT_COMPARABLE);
      } else {
        const d = diff as number;
        expect
          .soft(result.vsBaseline, `${at}: vsBaseline`)
          .toBe(d > 0 ? "Below Baseline" : d === 0 ? "Equal to Baseline" : "Above Baseline");
      }
    },
  );
});

// ---- Hand-written cases ---------------------------------------------------

const project: ForwarderProjectTerms = {
  current_incoterm: "DDP",
  shipment_mode: "Sea",
  shipment_type: "FCL",
  current_freight_cost_usd: 8000,
  final_incoterm: "DDP",
  final_shipment_mode: "Sea",
  final_shipment_type: "FCL",
  shipments_per_month: null,
  shipments_per_year: 10,
};

function quote(overrides: Partial<ForwarderQuoteInput>): ForwarderQuoteInput {
  return {
    shipment_mode: "Sea",
    shipment_type: "FCL",
    incoterm: "DDP",
    actual_weight_kg: 1000,
    chargeable_weight_kg: null,
    cost_of_goods_usd: 20000,
    original_currency: "USD",
    original_amount: 7000,
    exchange_rate_to_usd: 1,
    duties_taxes_usd: null,
    other_charges_usd: null,
    quote_completeness: "Complete / Comparable",
    ...overrides,
  };
}

describe("hand-written cases", () => {
  test("VND at 0.00004 converts and rounds to cents", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({
        original_currency: "VND",
        original_amount: 175_000_123,
        exchange_rate_to_usd: 0.00004,
      }),
    ]);
    // 175,000,123 × 0.00004 = 7000.00492 -> 7000.00
    expect(results[0].freightCostUsd).toBe(7000);
    expect(results[0].costDifference).toBe(1000);
    expect(results[0].vsBaseline).toBe("Below Baseline");
    expect(results[0].rankPosition).toBe("Only Comparable Quote");
  });

  test("a converted quote ties exactly with a USD quote and shares its rank", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_currency: "CNY", original_amount: 50000, exchange_rate_to_usd: 0.14 }),
      quote({ original_amount: 7500 }),
    ]);
    expect(results[1].freightCostUsd).toBe(7000);
    expect(results.map((r) => r.costRank)).toEqual([1, 1, 3]);
    expect(results.map((r) => r.rankPosition)).toEqual([
      "Lowest Freight Cost",
      "Lowest Freight Cost",
      "Highest Freight Cost",
    ]);
  });

  test("a quote equal to the baseline is Equal to Baseline", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_currency: "EUR", original_amount: 7407.41, exchange_rate_to_usd: 1.08 }),
    ]);
    // 7407.41 × 1.08 = 8000.0028 -> 8000.00
    expect(results[0].freightCostUsd).toBe(8000);
    expect(results[0].costDifference).toBe(0);
    expect(results[0].vsBaseline).toBe("Equal to Baseline");
  });

  test("a project with no baseline cost: savings are blank, ranking still works", () => {
    const { results } = buildForwarderCostComparison(
      { ...project, current_freight_cost_usd: null },
      [quote({ original_amount: 7000 }), quote({ original_amount: 9000 })],
    );
    for (const r of results) {
      expect(r.costDifference).toBeNull();
      expect(r.savingPct).toBeNull();
      expect(r.annualCostDifference).toBeNull();
      expect(r.annualSavingsPct).toBeNull();
      expect(r.vsBaseline).toBeNull();
      expect(r.estimatedAnnualFreightCost).not.toBeNull();
    }
    expect(results.map((r) => r.costRank)).toEqual([1, 2]);
  });

  test("no annual volume: annual figures are blank", () => {
    const { effectiveAnnualShipments, results } = buildForwarderCostComparison(
      { ...project, shipments_per_year: null, shipments_per_month: null },
      [quote({})],
    );
    expect(effectiveAnnualShipments).toBeNull();
    expect(results[0].estimatedAnnualFreightCost).toBeNull();
    expect(results[0].annualCostDifference).toBeNull();
    expect(results[0].costDifference).toBe(1000);
  });

  test("Air uses chargeable weight for cost per kg when set", () => {
    const air = { ...project, shipment_mode: "Air", shipment_type: "Air Freight" };
    const { results } = buildForwarderCostComparison(air, [
      quote({ shipment_mode: "Air", shipment_type: "Air Freight", actual_weight_kg: 1000, chargeable_weight_kg: 1400, original_amount: 7000 }),
      quote({ shipment_mode: "Air", shipment_type: "Air Freight", actual_weight_kg: 1000, chargeable_weight_kg: null, original_amount: 7000 }),
    ]);
    expect(results[0].costPerKg).toBe(5);
    expect(results[1].costPerKg).toBe(7);
  });

  test("a middle rank has no position label", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_amount: 7500 }),
      quote({ original_amount: 9000 }),
    ]);
    expect(results[1].costRank).toBe(2);
    expect(results[1].rankPosition).toBeNull();
  });
});

// ---- Deliberate deviations from the spreadsheet ----------------------------
// (a) quotes from rejected forwarders aren't ranked; (b) ties are labelled
// symmetrically. The golden fixture has no forwarder statuses and no
// tied-highest group, so none of its expectations change.

describe("deviation: rejected forwarders are excluded from ranking", () => {
  test("the excluded statuses are exactly the migration's rejected statuses", () => {
    expect(RANKING_EXCLUDED_STATUSES).toEqual([
      "Unfit",
      "Do Not Contact",
      "Withdrawn / No Response",
    ]);
  });

  test("an excluded quote is unranked and the rest re-rank without it", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_amount: 7500, forwarder_status: "Unfit" }),
      quote({ original_amount: 9000 }),
    ]);
    expect(results.map((r) => r.costRank)).toEqual([1, null, 2]);
    expect(results.map((r) => r.rankPosition)).toEqual([
      "Lowest Freight Cost",
      null,
      "Highest Freight Cost",
    ]);
    // Savings are unaffected by the exclusion.
    expect(results[1].costDifference).toBe(500);
    expect(results[1].vsBaseline).toBe("Below Baseline");
    expect(results[1].estimatedAnnualFreightCost).toBe(75000);
  });

  test("an excluded quote that would have been lowest doesn't take rank 1", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 5000, forwarder_status: "Do Not Contact" }),
      quote({ original_amount: 7000 }),
      quote({ original_amount: 9000 }),
    ]);
    expect(results.map((r) => r.costRank)).toEqual([null, 1, 2]);
    expect(results[1].rankPosition).toBe("Lowest Freight Cost");
  });

  test("a group reduced to one quote by exclusion is Only Comparable Quote", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_amount: 6000, forwarder_status: "Withdrawn / No Response" }),
    ]);
    expect(results[0].costRank).toBe(1);
    expect(results[0].rankPosition).toBe("Only Comparable Quote");
  });

  test("the ranking gate wins: an excluded quote on other terms is Not Comparable", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ incoterm: "FOB", forwarder_status: "Unfit" }),
    ]);
    expect(results[0].costRank).toBe(NOT_COMPARABLE);
    expect(results[0].rankPosition).toBe(NOT_COMPARABLE);
  });

  test("other statuses (e.g. Vetted) are ranked normally", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000, forwarder_status: "Vetted" }),
    ]);
    expect(results[0].rankPosition).toBe("Only Comparable Quote");
  });
});

describe("deviation: symmetric tie labels", () => {
  test("two quotes tied for highest are both Highest Freight Cost", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_amount: 9000 }),
      quote({ original_amount: 9000 }),
    ]);
    expect(results.map((r) => r.costRank)).toEqual([1, 2, 2]);
    expect(results.map((r) => r.rankPosition)).toEqual([
      "Lowest Freight Cost",
      "Highest Freight Cost",
      "Highest Freight Cost",
    ]);
  });

  test("an all-equal group is labelled Lowest Freight Cost throughout", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000 }),
      quote({ original_currency: "CNY", original_amount: 50000, exchange_rate_to_usd: 0.14 }),
      quote({ original_amount: 7000 }),
    ]);
    expect(results.map((r) => r.costRank)).toEqual([1, 1, 1]);
    expect(results.every((r) => r.rankPosition === "Lowest Freight Cost")).toBe(true);
  });
});

describe("one ranking pool per project", () => {
  test("every quote that passes the final-terms gate is ranked together", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ original_amount: 7000, origin: "Ho Chi Minh City" } as never),
      quote({ original_amount: 6500, origin: "Hanoi" } as never),
      quote({ original_amount: 7500 }),
    ]);
    expect(results.map((r) => r.costRank)).toEqual([2, 1, 3]);
    expect(results.map((r) => r.rankPosition)).toEqual([
      null,
      "Lowest Freight Cost",
      "Highest Freight Cost",
    ]);
  });

  test("a quote with different terms is not ranked and does not change anyone else's rank", () => {
    const ddp = [quote({ original_amount: 7000 }), quote({ original_amount: 8000 })];
    const ddu = quote({ incoterm: "DDU (legacy term)", original_amount: 3000 });
    const without = buildForwarderCostComparison(project, ddp).results;
    const withDdu = buildForwarderCostComparison(project, [...ddp, ddu]).results;
    expect(withDdu.slice(0, 2).map((r) => [r.costRank, r.rankPosition, r.vsBaseline])).toEqual(
      without.map((r) => [r.costRank, r.rankPosition, r.vsBaseline]),
    );
    expect(withDdu[2].costRank).toBe(NOT_COMPARABLE);
    expect(withDdu[2].rankPosition).toBe(NOT_COMPARABLE);
    expect(withDdu[2].vsBaseline).toBe(NOT_COMPARABLE);
  });
});

describe("hasDifferentTerms", () => {
  test("only when the final terms are set, the quote states all three, and they differ", () => {
    expect(hasDifferentTerms(quote({ incoterm: "DDU (legacy term)" }), project)).toBe(true);
    expect(hasDifferentTerms(quote({ shipment_type: "LCL" }), project)).toBe(true);
    expect(hasDifferentTerms(quote({}), project)).toBe(false);
    expect(hasDifferentTerms(quote({ incoterm: null }), project)).toBe(false);
    expect(hasDifferentTerms(quote({ incoterm: "DDU (legacy term)" }), { ...project, final_incoterm: null })).toBe(false);
  });
});
