import { describe, expect, test } from "vitest";
import { buildInputSnapshot, type LinkProject, type LinkQuote } from "./forwarder-link";
import { summarizeLinkedEstimates } from "./linked-estimates";

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
const quoteA: LinkQuote = {
  id: "qa",
  updated_at: "",
  forwarder_id: "f1",
  forwarder_name: "Acme",
  label: "Sea FCL",
  shipment_mode: "Sea",
  cost_of_goods_usd: null,
  duties_taxes_usd: 3100,
  lead_time_min_days: null,
  lead_time_max_days: null,
};
const quoteB: LinkQuote = { ...quoteA, id: "qb", label: "Air", duties_taxes_usd: null };
const quotes = new Map([
  [quoteA.id, quoteA],
  [quoteB.id, quoteB],
]);
const choices = { customs_value_basis: "invoice" as const, deduction_offered: true, quantity_from: null };

function row(id: string, quoteId: string | null, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    created_at: createdAt,
    as_of_date: createdAt.slice(0, 10),
    entry_date: createdAt.slice(0, 10),
    total_usd: "3000.00",
    warnings: [],
    duty_reviews: [],
    forwarder_quote_id: quoteId,
    input_snapshot: buildInputSnapshot(project, quoteId ? quotes.get(quoteId)! : null, choices),
    ...extra,
  };
}

describe("summarizeLinkedEstimates", () => {
  test("the latest estimate per quote and for the project, with how many earlier", () => {
    const summaries = summarizeLinkedEstimates(
      [
        row("old", "qa", "2026-10-01T09:00:00Z"),
        row("new", "qa", "2026-10-03T09:00:00Z"),
        row("proj", null, "2026-10-02T09:00:00Z"),
        row("b", "qb", "2026-10-02T09:00:00Z"),
      ],
      project,
      quotes,
    );
    expect(summaries.map((s) => [s.estimateId, s.quoteId, s.earlierCount])).toEqual([
      ["new", "qa", 1],
      ["proj", null, 0],
      ["b", "qb", 0],
    ]);
  });

  test("compares with the forwarder's current quoted duties", () => {
    const [a, b, p] = summarizeLinkedEstimates(
      [row("a", "qa", "2026-10-03T00:00:00Z"), row("b", "qb", "2026-10-02T00:00:00Z"), row("p", null, "2026-10-01T00:00:00Z")],
      project,
      quotes,
    );
    expect(a.comparison).toEqual({ kind: "compared", quotedUsd: 3100, estimateUsd: 3000, differenceUsd: 100, flag: false });
    expect(b.comparison).toEqual({ kind: "not_quoted" });
    // The project's own estimate has no forwarder figure to compare.
    expect(p.comparison).toBeNull();
  });

  test("carries the estimate's labels", () => {
    const [s] = summarizeLinkedEstimates(
      [
        row("a", "qa", "2026-10-03T00:00:00Z", {
          warnings: [
            { programKey: "section_232_timber" },
            { programKey: "forced_labor", counted: false },
          ],
          duty_reviews: [
            { programKey: "a", name: "Origin 301", status: "reviewed", reviewedAt: "2026-10-02T08:00:00Z" },
            { programKey: "b", name: "Section 232 metals", status: "reviewed", reviewedAt: "2026-09-30T08:00:00Z" },
            { programKey: "c", name: "China 301", status: "pending_review", reviewedAt: null },
          ],
        }),
      ],
      project,
      quotes,
    );
    expect(s).toMatchObject({
      excludedCount: 1,
      pendingReview: ["China 301"],
      lastReviewedOn: "2026-10-02",
      asOfDate: "2026-10-03",
      totalUsd: 3000,
    });
  });

  test("names inputs that changed since", () => {
    const [s] = summarizeLinkedEstimates(
      [row("a", "qa", "2026-10-03T00:00:00Z")],
      { ...project, invoice_value: 45000 },
      new Map([[quoteA.id, { ...quoteA, duties_taxes_usd: 2000 }]]),
    );
    expect(s.changes.map((c) => c.label)).toEqual(["Invoice value", "Forwarder's quoted duties"]);
  });

  test("malformed rows are skipped, and a missing snapshot shows no changes", () => {
    const summaries = summarizeLinkedEstimates(
      [{ id: 1 }, row("a", "qa", "2026-10-03T00:00:00Z", { input_snapshot: { bad: true } })],
      project,
      quotes,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].changes).toEqual([]);
  });
});
