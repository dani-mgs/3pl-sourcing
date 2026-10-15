import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { LinkedEstimateSummary } from "@/lib/tariff/linked-estimates";
import { DutyEstimatesList } from "./duty-estimates";

// The Duty estimates card on a forwarder project: an estimate whose total
// leaves programs out carries the same "Incomplete estimate" badge as the
// Tariff Calculator, above its EXCLUDES label.

const summary = (overrides: Partial<LinkedEstimateSummary>): LinkedEstimateSummary => ({
  estimateId: "00000000-0000-4000-8000-000000000001",
  quoteId: null,
  asOfDate: "2026-10-14",
  entryDate: "2026-10-14",
  totalUsd: 647.14,
  excludedCount: 0,
  incomplete: false,
  pendingReview: [],
  lastReviewedOn: null,
  comparison: null,
  changes: [],
  earlierCount: 0,
  ...overrides,
});

const render = (s: LinkedEstimateSummary) =>
  renderToStaticMarkup(
    <DutyEstimatesList rows={[{ summary: s, title: "Project" }]} projectId="p1" canWrite={false} emptyText="None" />,
  );

describe("Duty estimates card", () => {
  test("a complete estimate has no badge", () => {
    expect(render(summary({}))).not.toContain("Incomplete estimate");
  });

  test("an incomplete estimate shows the badge, then the EXCLUDES label", () => {
    const html = render(summary({ excludedCount: 2, incomplete: true }));
    expect(html).toContain('data-testid="incomplete-estimate"');
    expect(html.indexOf("EXCLUDES 2 additional duty programs that may apply")).toBeGreaterThan(
      html.indexOf("Incomplete estimate"),
    );
  });
});
