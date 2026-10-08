import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import {
  NOT_COMPARABLE,
  hasDifferentTerms,
  type ForwarderProjectTerms,
} from "@/lib/forwarder/cost-comparison";
import { quoteLabel } from "@/lib/forwarder/quote-label";
import { projectBarScale, sortForDisplay } from "@/lib/forwarder/project-summary";
import {
  AnnualSavingsCell,
  FreightCell,
  LeadTimeCell,
  QuoteIdentity,
  ValidUntilCell,
  VsBaselineCell,
  rankLabel,
  type ComparisonResult,
} from "./quote-cells";

export type { ComparisonQuote, ComparisonResult } from "./quote-cells";

const headClass =
  "px-2.5 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-neutral-muted";
const cellClass = "px-2.5 py-2.5";

type FinalTerms = Pick<
  ForwarderProjectTerms,
  "final_incoterm" | "final_shipment_mode" | "final_shipment_type"
>;

export function QuoteComparisonPanel({
  projectId,
  results,
  bestQuoteIds,
  baseline,
  targetLeadTime,
  today,
  finalTerms,
}: {
  projectId: string;
  results: ComparisonResult[];
  bestQuoteIds: string[];
  baseline: number | null;
  targetLeadTime: number | null;
  today: string;
  finalTerms: FinalTerms;
}) {
  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-muted">
        Quotes will be compared here once forwarders have quoted.
      </p>
    );
  }

  // One table for the project: ranked quotes first, then quotes that weren't
  // ranked (different terms, or incomplete).
  const rows = sortForDisplay(results);
  const anyRanked = results.some((r) => r.costRank !== NOT_COMPARABLE);
  const scale = projectBarScale(results, baseline);
  const best = new Set(bestQuoteIds);
  const finalSet =
    finalTerms.final_incoterm != null &&
    finalTerms.final_shipment_mode != null &&
    finalTerms.final_shipment_type != null;
  const anyDifferent = results.some((r) => hasDifferentTerms(r.quote, finalTerms));

  return (
    <div className="flex flex-col gap-3">
      {finalSet && (
        <p className="text-xs text-neutral-muted">
          Ranked on the project&apos;s final terms:{" "}
          <span className="font-medium text-move-navy">
            {quoteLabel({
              incoterm: finalTerms.final_incoterm,
              shipment_mode: finalTerms.final_shipment_mode,
              shipment_type: finalTerms.final_shipment_type,
            })}
          </span>
          .{anyDifferent && " Quotes with different terms are listed below them and aren\u2019t ranked."}
        </p>
      )}

      <div
        // relative: makes this scroll box the containing block for the sr-only
        // labels inside cells, which otherwise escape it and widen the page.
        className="relative overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-border">
              <th className={headClass}>Forwarder · Quote</th>
              <th className={headClass}>Freight Cost · /kg</th>
              <th className={headClass}>Lead Time</th>
              <th className={headClass}>Valid Until</th>
              <th className={headClass}>Rank</th>
              <th className={headClass}>vs Baseline</th>
              <th className={headClass}>Annual Savings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((result) => {
              const { quote } = result;
              const isBest = best.has(quote.id);
              const different = hasDifferentTerms(quote, finalTerms);
              const unranked = result.costRank === NOT_COMPARABLE;
              return (
                <tr
                  key={quote.id}
                  className={
                    "border-b border-neutral-border last:border-b-0 " +
                    (isBest
                      ? "bg-move-green/5 hover:bg-move-green/10"
                      : unranked
                        ? "bg-neutral-bg/70 text-neutral-muted hover:bg-neutral-bg"
                        : "hover:bg-neutral-bg")
                  }
                >
                  <td
                    className={`${cellClass} min-w-40 ${isBest ? "shadow-[inset_3px_0_0_var(--color-move-green)]" : ""}`}
                  >
                    <Link
                      href={`/forwarder-sourcing/${projectId}/forwarders/${quote.forwarder_id}`}
                      className="font-medium text-move-navy hover:underline"
                    >
                      {quote.forwarder_name}
                    </Link>
                    {isBest && <span className="sr-only"> (best quote)</span>}
                    <QuoteIdentity quote={quote} />
                  </td>
                  <td className={cellClass}>
                    {/* Unranked quotes get no bar when others are ranked: a bar
                        beside ranked ones would suggest they are comparable. */}
                    <FreightCell
                      result={result}
                      scale={unranked && anyRanked ? null : scale}
                      baseline={baseline}
                    />
                  </td>
                  <td className={cellClass}>
                    <LeadTimeCell quote={quote} target={targetLeadTime} />
                  </td>
                  <td className={cellClass}>
                    <ValidUntilCell validUntil={quote.rate_valid_until} today={today} />
                  </td>
                  <td className={`${cellClass} min-w-24 text-neutral-muted`}>
                    {rankLabel(quote, result, different)}
                  </td>
                  <td className={cellClass}>
                    <VsBaselineCell result={result} />
                  </td>
                  <td className={cellClass}>
                    <AnnualSavingsCell result={result} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {baseline != null && scale != null && (
        <p className="flex items-center gap-2 text-xs text-neutral-muted">
          <span className="inline-block h-3 w-px bg-move-navy" aria-hidden="true" />
          Baseline {formatCurrency(baseline, "USD")} (current freight cost)
        </p>
      )}
    </div>
  );
}
