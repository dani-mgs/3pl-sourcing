"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { costBarScale } from "@/lib/forwarder/project-summary";
import {
  AnnualSavingsCell,
  FreightCell,
  LeadTimeCell,
  ValidUntilCell,
  VsBaselineCell,
  rankLabel,
  type ComparisonResult,
} from "./quote-cells";

export type { ComparisonQuote, ComparisonResult } from "./quote-cells";

const headClass =
  "px-2.5 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-neutral-muted";
const cellClass = "px-2.5 py-2.5";

function groupResults(results: ComparisonResult[]): Map<string, ComparisonResult[]> {
  const groups = new Map<string, ComparisonResult[]>();
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
  return groups;
}

export function QuoteComparisonPanel({
  projectId,
  results,
  bestQuoteIds,
  baseline,
  targetLeadTime,
  today,
  defaultGroup,
}: {
  projectId: string;
  results: ComparisonResult[];
  bestQuoteIds: string[];
  baseline: number | null;
  targetLeadTime: number | null;
  today: string;
  defaultGroup: string | null;
}) {
  const groups = groupResults(results);
  const groupNames = [...groups.keys()];
  const [selected, setSelected] = useState<string | null>(
    defaultGroup && groups.has(defaultGroup) ? defaultGroup : (groupNames[0] ?? null),
  );

  if (results.length === 0 || selected == null) {
    return (
      <p className="py-6 text-center text-sm text-neutral-muted">
        Quotes will be compared here once forwarders have quoted.
      </p>
    );
  }

  const activeGroup = groups.has(selected) ? selected : groupNames[0];
  const rows = groups.get(activeGroup) ?? [];
  const scale = costBarScale(
    rows.map((r) => r.freightCostUsd),
    baseline,
  );
  const best = new Set(bestQuoteIds);

  return (
    <div className="flex flex-col gap-3">
      {groupNames.length > 1 ? (
        <div
          role="tablist"
          aria-label="Scenario groups"
          className="flex flex-wrap gap-1 self-start rounded-xl border border-neutral-border bg-neutral-bg p-1"
        >
          {groupNames.map((name) => {
            const active = name === activeGroup;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(name)}
                className={
                  "max-w-72 truncate rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-move-green " +
                  (active
                    ? "bg-white text-move-navy shadow-sm"
                    : "text-neutral-muted hover:text-move-navy")
                }
                title={name}
              >
                {name}
                <span className="ml-1.5 text-xs font-normal text-neutral-muted">
                  {groups.get(name)!.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <h3 className="text-sm font-semibold text-move-navy">{activeGroup}</h3>
      )}

      <div
        role={groupNames.length > 1 ? "tabpanel" : undefined}
        // relative: makes this scroll box the containing block for the sr-only
        // labels inside cells, which otherwise escape it and widen the page.
        className="relative overflow-x-auto rounded-2xl border border-neutral-border bg-white shadow-sm"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-border">
              <th className={headClass}>Forwarder · Terms</th>
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
              const terms = [quote.incoterm, quote.shipment_mode, quote.shipment_type]
                .filter(Boolean)
                .join(" / ");
              return (
                <tr
                  key={quote.id}
                  className={
                    "border-b border-neutral-border last:border-b-0 " +
                    (isBest ? "bg-move-green/5 hover:bg-move-green/10" : "hover:bg-neutral-bg")
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
                    <span className="block text-xs text-neutral-muted">{terms || "—"}</span>
                  </td>
                  <td className={cellClass}>
                    <FreightCell result={result} scale={scale} baseline={baseline} />
                  </td>
                  <td className={cellClass}>
                    <LeadTimeCell quote={quote} target={targetLeadTime} />
                  </td>
                  <td className={cellClass}>
                    <ValidUntilCell validUntil={quote.rate_valid_until} today={today} />
                  </td>
                  <td className={`${cellClass} min-w-24 text-neutral-muted`}>{rankLabel(quote, result)}</td>
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
