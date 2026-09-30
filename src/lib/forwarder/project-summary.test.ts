import { describe, expect, test } from "vitest";
import {
  buildForwarderCostComparison,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
} from "./cost-comparison";
import {
  costBarScale,
  exceedsTargetLeadTime,
  freightInvoiceRatio,
  leadTimeRange,
  lowestFreightQuote,
  pickBestQuotes,
  pipelineCounts,
  quotePosition,
  rateValidity,
} from "./project-summary";

const project: ForwarderProjectTerms = {
  current_incoterm: "FOB",
  shipment_mode: "Sea",
  shipment_type: "LCL",
  current_freight_cost_usd: 2800,
  final_incoterm: "FOB",
  final_shipment_mode: "Sea",
  final_shipment_type: "LCL",
  shipments_per_month: 3,
  shipments_per_year: null,
};

type Q = ForwarderQuoteInput & { name: string };

function quote(overrides: Partial<Q>): Q {
  return {
    name: "Q",
    scenario_group: "LCL",
    shipment_mode: "Sea",
    shipment_type: "LCL",
    incoterm: "FOB",
    actual_weight_kg: null,
    chargeable_weight_kg: null,
    cost_of_goods_usd: null,
    original_currency: "USD",
    original_amount: 1000,
    exchange_rate_to_usd: 1,
    duties_taxes_usd: null,
    other_charges_usd: null,
    quote_completeness: null,
    forwarder_status: "Vetted",
    ...overrides,
  };
}

function best(quotes: Q[]) {
  const { results } = buildForwarderCostComparison(project, quotes);
  const picked = pickBestQuotes(results);
  return { names: picked.best.map((r) => r.quote.name), groups: picked.rankedGroupCount };
}

describe("pickBestQuotes", () => {
  test("picks the single lowest eligible quote", () => {
    expect(
      best([quote({ name: "A", original_amount: 2650 }), quote({ name: "B", original_amount: 2400 })]),
    ).toEqual({ names: ["B"], groups: 1 });
  });

  test("returns every tied-lowest quote", () => {
    expect(
      best([
        quote({ name: "A", original_amount: 2650 }),
        quote({ name: "B", original_amount: 2650 }),
        quote({ name: "C", original_amount: 2900 }),
      ]).names,
    ).toEqual(["A", "B"]);
  });

  test("ignores excluded forwarders even when cheapest", () => {
    expect(
      best([
        quote({ name: "A", original_amount: 2650 }),
        quote({ name: "Cheap", original_amount: 2100, forwarder_status: "Do Not Contact" }),
      ]).names,
    ).toEqual(["A"]);
  });

  test("ignores quotes that don't match the final terms", () => {
    expect(
      best([
        quote({ name: "A", original_amount: 2650 }),
        quote({ name: "CIF", original_amount: 1000, incoterm: "CIF", scenario_group: "CIF" }),
      ]),
    ).toEqual({ names: ["A"], groups: 1 });
  });

  test("takes the lowest across scenario groups and counts ranked groups", () => {
    expect(
      best([
        quote({ name: "A", original_amount: 2650, scenario_group: "G1" }),
        quote({ name: "B", original_amount: 2500, scenario_group: "G2" }),
      ]),
    ).toEqual({ names: ["B"], groups: 2 });
  });

  test("returns nothing when no quote is eligible", () => {
    expect(best([quote({ original_amount: null })])).toEqual({ names: [], groups: 0 });
  });
});

describe("freightInvoiceRatio", () => {
  test("divides freight by invoice value in USD", () => {
    expect(freightInvoiceRatio(2800, 32500, "USD")).toBeCloseTo(0.08615, 4);
  });

  test("is null for a non-USD invoice, missing values, or a zero invoice", () => {
    expect(freightInvoiceRatio(2800, 32500, "EUR")).toBeNull();
    expect(freightInvoiceRatio(2800, 32500, null)).toBeNull();
    expect(freightInvoiceRatio(null, 32500, "USD")).toBeNull();
    expect(freightInvoiceRatio(2800, null, "USD")).toBeNull();
    expect(freightInvoiceRatio(2800, 0, "USD")).toBeNull();
  });
});

describe("leadTimeRange", () => {
  test("formats a range, a single value, and nothing", () => {
    expect(leadTimeRange(18, 25)).toBe("18–25 d");
    expect(leadTimeRange(22, 22)).toBe("22 d");
    expect(leadTimeRange(null, 30)).toBe("30 d");
    expect(leadTimeRange(12.5, null)).toBe("12.5 d");
    expect(leadTimeRange(null, null)).toBeNull();
  });
});

describe("exceedsTargetLeadTime", () => {
  test("compares the slowest stated lead time to the target", () => {
    expect(exceedsTargetLeadTime(18, 25, 22)).toBe(true);
    expect(exceedsTargetLeadTime(18, 22, 22)).toBe(false);
    expect(exceedsTargetLeadTime(24, null, 22)).toBe(true);
  });

  test("is false when either side is missing", () => {
    expect(exceedsTargetLeadTime(null, null, 22)).toBe(false);
    expect(exceedsTargetLeadTime(30, 40, null)).toBe(false);
  });
});

describe("rateValidity", () => {
  const today = "2026-09-30";

  test("flags expired, soon, and fine dates", () => {
    expect(rateValidity("2026-09-29", today)).toEqual({ kind: "expired" });
    expect(rateValidity("2026-09-30", today)).toEqual({ kind: "soon", daysLeft: 0 });
    expect(rateValidity("2026-10-07", today)).toEqual({ kind: "soon", daysLeft: 7 });
    expect(rateValidity("2026-10-08", today)).toEqual({ kind: "ok" });
  });

  test("handles no date", () => {
    expect(rateValidity(null, today)).toEqual({ kind: "none" });
  });
});

describe("costBarScale", () => {
  test("uses the larger of the dearest quote and the baseline", () => {
    expect(costBarScale([2650, 2100, null], 2800)).toBe(2800);
    expect(costBarScale([3400], 2800)).toBe(3400);
    expect(costBarScale([2650], null)).toBe(2650);
    expect(costBarScale([null], null)).toBeNull();
  });
});

describe("pipelineCounts", () => {
  test("counts forwarders, quoted forwarders, and excluded forwarders", () => {
    expect(
      pipelineCounts(
        [
          { id: "a", status: "Vetted" },
          { id: "b", status: "Do Not Contact" },
          { id: "c", status: "Contacted" },
        ],
        [{ forwarder_id: "a" }, { forwarder_id: "a" }, { forwarder_id: "b" }],
      ),
    ).toEqual({ total: 3, quoted: 2, excluded: 1 });
  });
});

describe("quotePosition", () => {
  function positionOf(quotes: Q[], name: string) {
    const { results } = buildForwarderCostComparison(project, quotes);
    const target = results.find((r) => r.quote.name === name)!;
    const position = quotePosition(results, target);
    return position && {
      rank: position.rank,
      of: position.rankedInGroup,
      tied: position.tiedWith.map((r) => r.quote.name),
    };
  }

  test("ranks against every quote in the group, not just one forwarder's", () => {
    expect(
      positionOf(
        [
          quote({ name: "Mine", original_amount: 2650 }),
          quote({ name: "Other", original_amount: 2400 }),
          quote({ name: "Third", original_amount: 2900 }),
        ],
        "Mine",
      ),
    ).toEqual({ rank: 2, of: 3, tied: [] });
  });

  test("reports ties on the same rank", () => {
    expect(
      positionOf(
        [
          quote({ name: "Coastal", original_amount: 2400 }),
          quote({ name: "Riverside", original_amount: 2400 }),
          quote({ name: "Third", original_amount: 2900 }),
        ],
        "Coastal",
      ),
    ).toEqual({ rank: 1, of: 3, tied: ["Riverside"] });
  });

  test("counts only ranked quotes in the same group", () => {
    expect(
      positionOf(
        [
          quote({ name: "Mine", original_amount: 2650 }),
          quote({ name: "Excluded", original_amount: 2000, forwarder_status: "Unfit" }),
          quote({ name: "OtherGroup", original_amount: 2000, scenario_group: "G2" }),
          quote({ name: "Unpriced", original_amount: null }),
        ],
        "Mine",
      ),
    ).toEqual({ rank: 1, of: 1, tied: [] });
  });

  test("null for an unranked quote", () => {
    expect(
      positionOf([quote({ name: "Excluded", forwarder_status: "Unfit" })], "Excluded"),
    ).toBeNull();
    expect(positionOf([quote({ name: "CIF", incoterm: "CIF" })], "CIF")).toBeNull();
  });
});

describe("lowestFreightQuote", () => {
  test("picks the cheapest priced quote whether or not it's ranked", () => {
    const { results } = buildForwarderCostComparison(project, [
      quote({ name: "A", original_amount: 2650, forwarder_status: "Unfit" }),
      quote({ name: "B", original_amount: 2400, incoterm: "CIF" }),
      quote({ name: "C", original_amount: null }),
    ]);
    expect(lowestFreightQuote(results)?.quote.name).toBe("B");
  });

  test("null when nothing is priced", () => {
    const { results } = buildForwarderCostComparison(project, [quote({ original_amount: null })]);
    expect(lowestFreightQuote(results)).toBeNull();
    expect(lowestFreightQuote([])).toBeNull();
  });
});
