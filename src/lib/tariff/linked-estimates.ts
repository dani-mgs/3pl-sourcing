import { z } from "zod";
import {
  compareDuties,
  inputChanges,
  parseInputSnapshot,
  type DutyComparison,
  type InputChange,
  type LinkProject,
  type LinkQuote,
} from "./forwarder-link";
import { excludedCount } from "./programs";

// Duty estimates linked to a forwarder project, summarized for the "Duty
// estimates" card on the project and forwarder pages: the latest estimate
// per quote (and for the project itself), its labels, what changed since,
// and the comparison with the duties the forwarder quoted. Display only —
// nothing here feeds ranking, savings or the comparison panel.

export const LINKED_ESTIMATE_COLUMNS =
  "id, created_at, as_of_date, total_usd, warnings, duty_reviews, forwarder_quote_id, input_snapshot";

const rowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  as_of_date: z.string(),
  total_usd: z.union([z.number(), z.string()]),
  warnings: z.unknown(),
  duty_reviews: z.unknown(),
  forwarder_quote_id: z.string().nullable(),
  input_snapshot: z.unknown(),
});

const reviewSchema = z.array(
  z.object({ name: z.string(), status: z.string(), reviewedAt: z.string().nullable() }).passthrough(),
);

export type LinkedEstimateSummary = {
  estimateId: string;
  // Null for an estimate of the project itself.
  quoteId: string | null;
  asOfDate: string;
  totalUsd: number;
  // Additional duty programs that may apply but aren't in the total.
  excludedCount: number;
  // Programs bearing on the line that are still pending expert review.
  pendingReview: string[];
  // Latest review date among the programs bearing on the line.
  lastReviewedOn: string | null;
  comparison: DutyComparison | null;
  changes: InputChange[];
  // Older estimates for the same quote (or project).
  earlierCount: number;
};

export function summarizeLinkedEstimates(
  rows: unknown[],
  project: LinkProject,
  quotes: Map<string, LinkQuote>,
): LinkedEstimateSummary[] {
  const parsed = rows.flatMap((row) => {
    const r = rowSchema.safeParse(row);
    return r.success ? [r.data] : [];
  });
  // Newest first, so the first row per key is the latest.
  parsed.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const byKey = new Map<string, typeof parsed>();
  for (const row of parsed) {
    const key = row.forwarder_quote_id ?? "";
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  return [...byKey.values()].map((group) => {
    const latest = group[0];
    const reviews = reviewSchema.safeParse(latest.duty_reviews);
    const reviewList = reviews.success ? reviews.data : [];
    const reviewedDates = reviewList
      .filter((r) => r.status === "reviewed" && r.reviewedAt)
      .map((r) => r.reviewedAt!.slice(0, 10))
      .sort();
    const quote = latest.forwarder_quote_id ? quotes.get(latest.forwarder_quote_id) ?? null : null;
    const snapshot = parseInputSnapshot(latest.input_snapshot);
    const totalUsd = Number(latest.total_usd);
    return {
      estimateId: latest.id,
      quoteId: latest.forwarder_quote_id,
      asOfDate: latest.as_of_date,
      totalUsd,
      excludedCount: excludedCount(latest.warnings),
      pendingReview: reviewList.filter((r) => r.status === "pending_review").map((r) => r.name),
      lastReviewedOn: reviewedDates.at(-1) ?? null,
      comparison: latest.forwarder_quote_id ? compareDuties(quote?.duties_taxes_usd ?? null, totalUsd) : null,
      changes: snapshot ? inputChanges(snapshot, project, latest.forwarder_quote_id ? quote ?? "deleted" : null) : [],
      earlierCount: group.length - 1,
    };
  });
}
