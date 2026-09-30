"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import {
  NOT_COMPARABLE,
  isExcludedFromRanking,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "@/lib/forwarder/cost-comparison";
import {
  costBarScale,
  exceedsTargetLeadTime,
  leadTimeRange,
  rateValidity,
} from "@/lib/forwarder/project-summary";

export type ComparisonQuote = ForwarderQuoteInput & {
  id: string;
  forwarder_id: string;
  forwarder_name: string;
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
  rate_valid_until: string | null;
};

export type ComparisonResult = ForwarderQuoteResult<ComparisonQuote>;

const headClass =
  "px-2.5 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-neutral-muted";
const cellClass = "px-2.5 py-2.5";

// Accessible text on white for "attention" states; Move Orange itself is too
// light for text, so it's used only for the small indicator dot.
const ATTENTION_TEXT = "text-[#B15400]";

function rankLabel(quote: ComparisonQuote, result: ComparisonResult): string {
  if (result.rankPosition === NOT_COMPARABLE) return "Not Comparable";
  if (isExcludedFromRanking(quote)) return "Excluded from ranking";
  return result.rankPosition ?? "—";
}

function VsBaselineCell({ result }: { result: ComparisonResult }) {
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
    <span className={`block whitespace-nowrap ${color}`}>
      {result.vsBaseline}{" "}
      <span className="block tabular-nums">
        {formatCurrency(result.costDifference, "USD")}
        {pct}
      </span>
    </span>
  );
}

function AnnualSavingsCell({ result }: { result: ComparisonResult }) {
  if (result.annualCostDifference === NOT_COMPARABLE) {
    return <span className="text-neutral-muted">Not Comparable</span>;
  }
  if (typeof result.annualCostDifference !== "number") {
    return <span className="text-neutral-muted">—</span>;
  }
  return <span>{formatCurrency(result.annualCostDifference, "USD")}</span>;
}

function barColor(result: ComparisonResult): string {
  if (isExcludedFromRanking(result.quote)) return "bg-neutral-muted/30";
  switch (result.vsBaseline) {
    case "Below Baseline":
      return "bg-move-green/70";
    case "Above Baseline":
      return "bg-danger/60";
    case "Equal to Baseline":
      return "bg-move-navy/40";
    default:
      return "bg-neutral-muted/30";
  }
}

// Freight cost with a bar scaled to the group's dearest quote or the
// baseline, and a marker at the baseline. Plain CSS, no chart library.
function FreightCell({
  result,
  scale,
  baseline,
}: {
  result: ComparisonResult;
  scale: number | null;
  baseline: number | null;
}) {
  if (result.freightCostUsd == null) {
    return <span className="text-neutral-muted">—</span>;
  }
  const width = scale ? Math.max(2, (result.freightCostUsd / scale) * 100) : 0;
  const marker = scale && baseline != null ? (baseline / scale) * 100 : null;
  return (
    <div className="min-w-28">
      <span className="whitespace-nowrap tabular-nums text-move-navy">
        {formatCurrency(result.freightCostUsd, "USD")}
      </span>
      {scale && (
        <div className="relative mt-1.5 h-1.5 rounded-full bg-neutral-bg" aria-hidden="true">
          <div className={`h-full rounded-full ${barColor(result)}`} style={{ width: `${width}%` }} />
          {marker != null && (
            <div
              className="absolute -top-1 -bottom-1 w-px bg-move-navy"
              style={{ left: `${marker}%` }}
            />
          )}
        </div>
      )}
      {result.costPerKg != null && (
        <span className="mt-1 block text-xs whitespace-nowrap tabular-nums text-neutral-muted">
          {formatCurrency(result.costPerKg, "USD")} / kg
        </span>
      )}
    </div>
  );
}

function LeadTimeCell({ quote, target }: { quote: ComparisonQuote; target: number | null }) {
  const label = leadTimeRange(quote.lead_time_min_days, quote.lead_time_max_days);
  if (!label) return <span className="text-neutral-muted">—</span>;
  const over = exceedsTargetLeadTime(quote.lead_time_min_days, quote.lead_time_max_days, target);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums ${over ? ATTENTION_TEXT : "text-move-navy"}`}
      title={over ? `Over the ${target} d target lead time` : undefined}
    >
      {label}
      {over && (
        <>
          <span className="size-1.5 rounded-full bg-move-orange" aria-hidden="true" />
          <span className="sr-only">(over target)</span>
        </>
      )}
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function ValidUntilCell({ validUntil, today }: { validUntil: string | null; today: string }) {
  const validity = rateValidity(validUntil, today);
  if (validity.kind === "none" || !validUntil) {
    return <span className="text-neutral-muted">—</span>;
  }
  const date = dateFormat.format(new Date(`${validUntil}T00:00:00Z`));
  if (validity.kind === "expired") {
    return (
      <span className="whitespace-nowrap text-danger" title={`Expired ${date}`}>
        Expired
        <span className="block text-xs text-neutral-muted">{date}</span>
      </span>
    );
  }
  if (validity.kind === "soon") {
    return (
      <span className={`whitespace-nowrap ${ATTENTION_TEXT}`}>
        {validity.daysLeft === 0 ? "Expires today" : `Expires in ${validity.daysLeft} d`}
        <span className="block text-xs text-neutral-muted">{date}</span>
      </span>
    );
  }
  return <span className="whitespace-nowrap text-neutral-muted">{date}</span>;
}

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
