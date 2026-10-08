import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import golden from "./__fixtures__/forwarder-cost-comparison.golden.json";
import {
  buildForwarderCostComparison,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
} from "./cost-comparison";
import { pickBestQuotes } from "./project-summary";
import { summarizeLinkedEstimates } from "@/lib/tariff/linked-estimates";
import type { LinkProject, LinkQuote } from "@/lib/tariff/forwarder-link";

// Guard: duty estimates never change ranking, savings or the comparison
// numbers (the ranking basis is still an open decision, docs/TECH_DEBT.md).
// Rankings and savings must be identical with and without estimates, and
// the comparison code must not read them at all.

type GoldenConfig = {
  project: ForwarderProjectTerms;
  quotes: { input: ForwarderQuoteInput }[];
};
const configs = golden.configs as unknown as Record<string, GoldenConfig>;

const project: LinkProject = {
  id: "p1",
  updated_at: "2026-10-01T00:00:00Z",
  hs_code: "6402.99.31.10",
  origin_country: "Vietnam",
  invoice_value: 40000,
  invoice_currency: "USD",
  current_incoterm: "CIF",
  current_freight_cost_usd: 2500,
  shipment_mode: "Sea",
  weight_kg: 1000,
  units: 100,
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Everything in a result except the quote object itself.
function numbers(results: ReturnType<typeof buildForwarderCostComparison>["results"]) {
  return results.map((r) => {
    const { quote, ...rest } = r;
    void quote;
    return rest;
  });
}

describe.each(Object.entries(configs))("rankings and savings ignore duty estimates: %s", (_name, config) => {
  const quotes = config.quotes.map((q, i) => ({ ...q.input, id: `q${i}`, forwarder_id: `f${i % 2}` }));

  test("identical with and without estimates", () => {
    const without = buildForwarderCostComparison(config.project, quotes);

    // Estimates wildly different from the quoted duties (so some are
    // flagged), saved for every quote.
    const estimateRows = quotes.map((q, i) => ({
      id: `e${i}`,
      created_at: `2026-10-0${(i % 9) + 1}T00:00:00Z`,
      as_of_date: "2026-10-05",
      entry_date: "2026-11-08",
      total_usd: 100000 + i,
      warnings: [{ programKey: "x" }],
      duty_reviews: [],
      forwarder_quote_id: q.id,
      input_snapshot: null,
    }));
    const linkQuotes = new Map<string, LinkQuote>(
      quotes.map((q) => [
        q.id,
        {
          id: q.id,
          updated_at: "",
          forwarder_id: q.forwarder_id,
          forwarder_name: "F",
          label: "DDP · Sea · FCL",
          shipment_mode: q.shipment_mode,
          cost_of_goods_usd: q.cost_of_goods_usd,
          duties_taxes_usd: q.duties_taxes_usd,
          lead_time_min_days: null,
          lead_time_max_days: null,
        },
      ]),
    );
    deepFreeze(without);
    const summaries = summarizeLinkedEstimates(estimateRows, project, linkQuotes);
    expect(summaries).toHaveLength(quotes.length);

    // Even if estimate fields ride along on the quotes, nothing changes.
    const withEstimates = buildForwarderCostComparison(
      config.project,
      quotes.map((q, i) => ({ ...q, duty_estimate_usd: 100000 + i, duties_taxes_usd: q.duties_taxes_usd })),
    );
    expect(numbers(withEstimates.results)).toEqual(numbers(without.results));
    expect(withEstimates.effectiveAnnualShipments).toBe(without.effectiveAnnualShipments);
    expect(pickBestQuotes(withEstimates.results).best.map((r) => r.quote.id)).toEqual(
      pickBestQuotes(without.results).best.map((r) => r.quote.id),
    );
  });
});

describe("the comparison code doesn't read duty estimates", () => {
  test.each(["cost-comparison.ts", "load-project-comparison.ts", "project-summary.ts"])("%s", (file) => {
    const source = readFileSync(path.join(__dirname, file), "utf8");
    expect(source).not.toMatch(/duty_estimates|tariff|linked-estimates|load-duty-estimates/);
  });
});
