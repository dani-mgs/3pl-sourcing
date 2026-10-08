import { describe, expect, test } from "vitest";
import fixture from "./__fixtures__/pakkable-terms.fixture.json";
import before from "./__fixtures__/pakkable-terms.before.json";
import {
  NOT_COMPARABLE,
  buildForwarderCostComparison,
  hasDifferentTerms,
  type ForwarderProjectTerms,
} from "./cost-comparison";
import { quoteLabel } from "./quote-label";
import {
  pickBestQuotes,
  projectBarScale,
  quotePosition,
  sortForDisplay,
} from "./project-summary";

// A project like Pakkable (Ho Chi Minh City to Guangzhou): current and final
// terms DDP/Sea/FCL, four DDP quotes (two tie) and two DDU quotes. Until now the
// DDP and DDU quotes sat in two scenario groups ("DDP - FCL", "DDU - FCL").
// pakkable-terms.before.json holds what the code produced WITH those groups,
// recorded before scenario groups were removed. With one ranking pool per
// project every DDP number must be exactly the same, and the DDU quotes must
// stay unranked.

const project = fixture.project as ForwarderProjectTerms;
const quotes = fixture.quotes.map((q) => ({ ...fixture.quoteDefaults, ...q }));
const { results } = buildForwarderCostComparison(project, quotes);
const byId = new Map(results.map((r) => [(r.quote as unknown as { id: string }).id, r]));
const idOf = (r: (typeof results)[number]) => (r.quote as unknown as { id: string }).id;

const NUMBER_FIELDS = [
  "freightCostUsd",
  "costPerKg",
  "freightCostRatio",
  "totalComparableLogisticsCost",
  "estimatedAnnualFreightCost",
  "costDifference",
  "savingPct",
  "annualCostDifference",
  "annualSavingsPct",
  "vsBaseline",
  "costRank",
  "rankPosition",
] as const;

describe("Pakkable-like project: numbers before and after removing scenario groups", () => {
  const ddpIds = ["q1", "q2", "q3", "q4"];

  test.each(ddpIds)("%s (DDP): every figure is identical to before", (id) => {
    const was = before.quotes.find((q) => q.id === id)!;
    const now = byId.get(id)!;
    for (const field of NUMBER_FIELDS) {
      expect(now[field], `${id} ${field}`).toEqual(was[field as keyof typeof was]);
    }
  });

  test.each(ddpIds)("%s (DDP): position among ranked quotes is identical to before", (id) => {
    const was = before.quotes.find((q) => q.id === id)!.position!;
    const now = quotePosition(results, byId.get(id)!)!;
    expect(now.rank).toBe(was.rank);
    expect(now.rankedInProject).toBe(was.rankedInGroup);
    expect(now.tiedWith.map(idOf)).toEqual(was.tiedWith);
  });

  test("Best-quote tile picks the same quote", () => {
    expect(pickBestQuotes(results).best.map(idOf)).toEqual(before.bestQuoteIds);
  });

  test("cost bars for the DDP quotes use the same scale as before", () => {
    const was = before.quotes.find((q) => q.id === "q1")!.barScale;
    expect(projectBarScale(results, project.current_freight_cost_usd)).toBe(was);
  });

  test.each(["q5", "q6"])("%s (DDU): still unranked, with the same figures as before", (id) => {
    const was = before.quotes.find((q) => q.id === id)!;
    const now = byId.get(id)!;
    for (const field of NUMBER_FIELDS) {
      expect(now[field], `${id} ${field}`).toEqual(was[field as keyof typeof was]);
    }
    expect(now.costRank).toBe(NOT_COMPARABLE);
    expect(quotePosition(results, now)).toBeNull();
    expect(hasDifferentTerms(now.quote, project)).toBe(true);
  });

  test("the table lists the ranked DDP quotes first and the DDU quotes last", () => {
    const order = sortForDisplay(results).map(idOf);
    expect(order.slice(0, 4)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(order.slice(4).sort()).toEqual(["q5", "q6"]);
  });

  test("quotes are named by their terms", () => {
    expect(quoteLabel(byId.get("q1")!.quote)).toBe("DDP · Sea · FCL");
    expect(quoteLabel(byId.get("q5")!.quote)).toBe("DDU · Sea · FCL");
  });
});
