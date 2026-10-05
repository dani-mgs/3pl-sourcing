"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import type { QuoteDetails } from "@/lib/forwarder/load-project-comparison";
import {
  FreightCell,
  LeadTimeCell,
  ValidUntilCell,
  VsBaselineCell,
  rankLabel,
  type ComparisonResult,
} from "../../quote-cells";
import { QuoteRowMenu } from "./quote-row-menu";

export type QuoteTableRow = {
  result: ComparisonResult;
  details: Omit<QuoteDetails, "updated_at"> & { updatedRelative: string };
  // Bar scale for the quote's scenario group, across every forwarder.
  scale: number | null;
  position: { rank: number; of: number; tied: boolean } | null;
  // The project's best quote overall (same highlight as Project Summary).
  isProjectBest: boolean;
  // Linked duty estimates (deleted with the quote).
  dutyEstimateCount: number;
};

const headClass =
  "px-2.5 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-neutral-muted";
const cellClass = "px-2.5 py-2.5";

const DETAIL_FIELDS: { key: keyof Omit<QuoteTableRow["details"], "updatedRelative">; label: string }[] = [
  { key: "key_strength", label: "Key Strength" },
  { key: "key_weakness_risk", label: "Key Weakness / Risk" },
  { key: "important_assumption", label: "Important Assumption" },
  { key: "overall_assessment", label: "Overall Assessment" },
  { key: "client_decision", label: "Client Decision" },
  { key: "notes", label: "Notes" },
];

function RankCell({ row }: { row: QuoteTableRow }) {
  const label = rankLabel(row.result.quote, row.result);
  const { position } = row;
  const place = position && `#${position.rank} of ${position.of}${position.tied ? " · tied" : ""}`;
  // A middle rank has no label ("—"), so the position is the headline.
  if (label === "—" && place) {
    return <span className="whitespace-nowrap text-move-navy">{place}</span>;
  }
  return (
    <span className="text-neutral-muted">
      {label}
      {place && <span className="block text-xs whitespace-nowrap">{place}</span>}
    </span>
  );
}

export function AddQuoteButton({ projectId, forwarderId }: { projectId: string; forwarderId: string }) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}/quotes/new`} />}
    >
      Add Quote
    </Button>
  );
}

export function QuotesTable({
  projectId,
  forwarderId,
  rows,
  baseline,
  targetLeadTime,
  today,
  canWrite,
}: {
  projectId: string;
  forwarderId: string;
  rows: QuoteTableRow[];
  baseline: number | null;
  targetLeadTime: number | null;
  today: string;
  canWrite: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-muted">
        No quotes yet. Add one once this forwarder has quoted.
      </p>
    );
  }

  const columnCount = canWrite ? 7 : 6;

  return (
    <div className="flex flex-col gap-3">
      {/* relative: keeps the sr-only labels inside cells from escaping the
          scroll box and widening the page on mobile. */}
      <div className="relative overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-border">
              <th className={headClass}>Scenario · Terms</th>
              <th className={headClass}>Freight Cost · /kg</th>
              <th className={headClass}>Lead · Valid</th>
              <th className={headClass}>Rank</th>
              <th className={headClass}>vs Baseline</th>
              <th className={headClass}>Completeness</th>
              {canWrite && (
                <th className={headClass}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const { result, details } = row;
              const { quote } = result;
              const terms = [quote.incoterm, quote.shipment_mode, quote.shipment_type]
                .filter(Boolean)
                .join(" / ");
              const filled = DETAIL_FIELDS.filter((f) => details[f.key]);
              const isOpen = expanded.has(quote.id);
              const detailId = `quote-details-${quote.id}`;
              // Hidden detail rows still count for :last-child, so borders
              // are set by position instead.
              const isLast = index === rows.length - 1;
              return (
                <Fragment key={quote.id}>
                  <tr
                    className={
                      (isLast && !isOpen ? "" : "border-b border-neutral-border ") +
                      (row.isProjectBest
                        ? "bg-move-green/5 hover:bg-move-green/10"
                        : "hover:bg-neutral-bg")
                    }
                  >
                    <td
                      className={`${cellClass} min-w-40 ${row.isProjectBest ? "shadow-[inset_3px_0_0_var(--color-move-green)]" : ""}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {filled.length > 0 ? (
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            aria-label={`${isOpen ? "Hide" : "Show"} details for ${quote.scenario_group}`}
                            onClick={() => toggle(quote.id)}
                            className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-muted outline-none hover:bg-neutral-bg hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
                          >
                            <ChevronRight
                              className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            />
                          </button>
                        ) : (
                          <span className="-ml-1 size-6 shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0 pt-0.5">
                          <span className="font-medium break-words text-move-navy">
                            {quote.scenario_group}
                          </span>
                          {row.isProjectBest && <span className="sr-only"> (best quote in project)</span>}
                          <span className="block text-xs text-neutral-muted">{terms || "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className={cellClass}>
                      <FreightCell result={result} scale={row.scale} baseline={baseline} showOriginal />
                    </td>
                    {/* Stacked (like the Lead time · Validity tile) so the
                        table fits beside the profile column at 1280px. */}
                    <td className={cellClass}>
                      <LeadTimeCell quote={quote} target={targetLeadTime} />
                      <span className="mt-1 block text-xs">
                        <ValidUntilCell validUntil={quote.rate_valid_until} today={today} />
                      </span>
                    </td>
                    <td className={`${cellClass} min-w-28`}>
                      <RankCell row={row} />
                    </td>
                    <td className={cellClass}>
                      <VsBaselineCell result={result} />
                    </td>
                    <td className={`${cellClass} min-w-28 text-neutral-muted`}>
                      <span className="text-move-navy">{quote.quote_completeness ?? "—"}</span>
                      <span className="block text-xs whitespace-nowrap">
                        Updated {details.updatedRelative}
                      </span>
                    </td>
                    {canWrite && (
                      <td className={cellClass}>
                        <QuoteRowMenu
                          projectId={projectId}
                          forwarderId={forwarderId}
                          quoteId={quote.id}
                          scenarioGroup={quote.scenario_group}
                          dutyEstimateCount={row.dutyEstimateCount}
                        />
                      </td>
                    )}
                  </tr>
                  {filled.length > 0 && (
                    <tr
                      id={detailId}
                      hidden={!isOpen}
                      className={`bg-neutral-bg/60 ${isLast ? "" : "border-b border-neutral-border"}`}
                    >
                      <td colSpan={columnCount} className="px-4 py-3 pl-11">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
                          {filled.map((f) => (
                            <div key={f.key} className="min-w-0">
                              <dt className="text-xs text-neutral-muted">{f.label}</dt>
                              <dd className="break-words whitespace-pre-line text-move-navy">
                                {details[f.key]}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {baseline != null && rows.some((r) => r.scale != null) && (
        <p className="flex items-center gap-2 text-xs text-neutral-muted">
          <span className="inline-block h-3 w-px bg-move-navy" aria-hidden="true" />
          Baseline {formatCurrency(baseline, "USD")} (current freight cost). Bars are scaled across every forwarder&apos;s quotes in the scenario.
        </p>
      )}
    </div>
  );
}
