import type { createClient } from "@/lib/supabase/server";
import { normalizeProject, type LinkQuote } from "@/lib/tariff/forwarder-link";
import {
  LINKED_ESTIMATE_COLUMNS,
  summarizeLinkedEstimates,
  type LinkedEstimateSummary,
} from "@/lib/tariff/linked-estimates";
import type { ProjectComparison } from "./load-project-comparison";

// Duty estimates linked to a forwarder project, for its project and
// forwarder pages. Read separately from the comparison and never passed into
// it: estimates are shown beside the quotes, not ranked with them.
// Server-side only.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ProjectDutyEstimate = {
  summary: LinkedEstimateSummary;
  title: string;
  // The quote's forwarder (null for the project's own estimate).
  forwarderId: string | null;
};

export type ProjectDutyEstimates = {
  estimates: ProjectDutyEstimate[];
  // Every saved estimate (not just the latest), for delete confirmations.
  total: number;
  countByQuote: Map<string, number>;
};

export async function loadProjectDutyEstimates(
  supabase: Supabase,
  comparison: Pick<ProjectComparison, "project" | "quotes">,
): Promise<ProjectDutyEstimates> {
  const { data, error } = await supabase
    .from("duty_estimates")
    .select(LINKED_ESTIMATE_COLUMNS)
    .eq("forwarder_project_id", comparison.project.id);
  if (error) {
    console.error("loadProjectDutyEstimates error:", error);
    return { estimates: [], total: 0, countByQuote: new Map() };
  }
  const rows = (data ?? []) as unknown as { forwarder_quote_id: string | null }[];

  const quotes = new Map<string, LinkQuote>(
    comparison.quotes.map((q) => [
      q.id,
      {
        id: q.id,
        updated_at: "",
        forwarder_id: q.forwarder_id,
        forwarder_name: q.forwarder_name,
        scenario_group: q.scenario_group,
        shipment_mode: q.shipment_mode,
        cost_of_goods_usd: q.cost_of_goods_usd,
        duties_taxes_usd: q.duties_taxes_usd,
      },
    ]),
  );
  const project = normalizeProject(comparison.project);

  const countByQuote = new Map<string, number>();
  for (const row of rows) {
    if (row.forwarder_quote_id) {
      countByQuote.set(row.forwarder_quote_id, (countByQuote.get(row.forwarder_quote_id) ?? 0) + 1);
    }
  }

  const estimates = summarizeLinkedEstimates(rows, project, quotes)
    .map((summary) => {
      const quote = summary.quoteId ? quotes.get(summary.quoteId) : null;
      return {
        summary,
        title: quote ? `${quote.forwarder_name} · ${quote.scenario_group}` : "Project",
        forwarderId: quote?.forwarder_id ?? null,
      };
    })
    // Project estimate first, then by forwarder and scenario.
    .sort((a, b) => (a.forwarderId == null ? -1 : b.forwarderId == null ? 1 : a.title.localeCompare(b.title)));

  return { estimates, total: rows.length, countByQuote };
}
