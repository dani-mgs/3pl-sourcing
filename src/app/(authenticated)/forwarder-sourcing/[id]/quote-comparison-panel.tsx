import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import {
  NOT_COMPARABLE,
  buildForwarderCostComparison,
  isExcludedFromRanking,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "@/lib/forwarder/cost-comparison";

export type ComparisonQuote = ForwarderQuoteInput & {
  id: string;
  forwarder_id: string;
  forwarder_name: string;
};

const headClass = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-muted";

function rankLabel(quote: ComparisonQuote, result: ForwarderQuoteResult<ComparisonQuote>): string {
  if (result.rankPosition === NOT_COMPARABLE) return "Not Comparable";
  if (isExcludedFromRanking(quote)) return "Excluded from ranking";
  return result.rankPosition ?? "—";
}

function VsBaselineCell({ result }: { result: ForwarderQuoteResult<ComparisonQuote> }) {
  if (result.vsBaseline === NOT_COMPARABLE) {
    return <span className="text-neutral-muted">Not Comparable</span>;
  }
  if (result.vsBaseline == null || typeof result.costDifference !== "number") {
    return <span className="text-neutral-muted">—</span>;
  }
  const color =
    result.costDifference > 0
      ? "text-move-green"
      : result.costDifference < 0
        ? "text-danger"
        : "text-neutral-muted";
  const pct =
    typeof result.savingPct === "number" ? ` (${(result.savingPct * 100).toFixed(1)}%)` : "";
  return (
    <span className={color}>
      {result.vsBaseline} {formatCurrency(result.costDifference, "USD")}
      {pct}
    </span>
  );
}

function AnnualSavingsCell({ result }: { result: ForwarderQuoteResult<ComparisonQuote> }) {
  if (result.annualCostDifference === NOT_COMPARABLE) {
    return <span className="text-neutral-muted">Not Comparable</span>;
  }
  if (typeof result.annualCostDifference !== "number") {
    return <span className="text-neutral-muted">—</span>;
  }
  return <span>{formatCurrency(result.annualCostDifference, "USD")}</span>;
}

export function QuoteComparisonPanel({
  projectId,
  project,
  quotes,
}: {
  projectId: string;
  project: ForwarderProjectTerms;
  quotes: ComparisonQuote[];
}) {
  if (quotes.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-muted">
        Quotes will be compared here once forwarders have quoted.
      </p>
    );
  }

  const { results } = buildForwarderCostComparison(project, quotes);

  const groups = new Map<string, ForwarderQuoteResult<ComparisonQuote>[]>();
  for (const result of results) {
    const list = groups.get(result.quote.scenario_group) ?? [];
    list.push(result);
    groups.set(result.quote.scenario_group, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const rankA = typeof a.costRank === "number" ? a.costRank : Infinity;
      const rankB = typeof b.costRank === "number" ? b.costRank : Infinity;
      return rankA - rankB;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([scenarioGroup, rows]) => (
        <div key={scenarioGroup}>
          <h3 className="mb-2 text-sm font-semibold text-move-navy">{scenarioGroup}</h3>
          <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-border">
                  <th className={headClass}>Forwarder</th>
                  <th className={headClass}>Incoterm / Mode / Type</th>
                  <th className={headClass}>Freight Cost</th>
                  <th className={headClass}>Cost / kg</th>
                  <th className={headClass}>Rank</th>
                  <th className={headClass}>vs Baseline</th>
                  <th className={headClass}>Annual Savings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((result) => {
                  const { quote } = result;
                  const terms = [quote.incoterm, quote.shipment_mode, quote.shipment_type]
                    .filter(Boolean)
                    .join(" / ");
                  return (
                    <tr key={quote.id} className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/forwarder-sourcing/${projectId}/forwarders/${quote.forwarder_id}`}
                          className="text-move-navy hover:underline"
                        >
                          {quote.forwarder_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-muted">{terms || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-move-navy">
                        {result.freightCostUsd != null ? formatCurrency(result.freightCostUsd, "USD") : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-muted">
                        {result.costPerKg != null ? formatCurrency(result.costPerKg, "USD") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-muted">{rankLabel(quote, result)}</td>
                      <td className="px-4 py-2.5">
                        <VsBaselineCell result={result} />
                      </td>
                      <td className="px-4 py-2.5">
                        <AnnualSavingsCell result={result} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
