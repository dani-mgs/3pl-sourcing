import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { ESTIMATE_DISCLAIMER } from "@/lib/tariff/caveats";
import type { LinkedEstimateSummary } from "@/lib/tariff/linked-estimates";
import { estimateDutiesHref } from "./duty-estimate-links";

// Saved duty estimates linked to this project's quotes (and the project
// itself), beside the forwarder's quoted duties. A separate card on purpose:
// the estimates never change ranking, savings or the comparison panel.
// No hooks, so it renders on the server.

const usd = (amount: number) => formatCurrency(amount, "USD");

const linkClass =
  "rounded font-medium text-move-navy underline decoration-neutral-border underline-offset-2 outline-none hover:decoration-move-green focus-visible:ring-2 focus-visible:ring-move-green";

function Comparison({ summary }: { summary: LinkedEstimateSummary }) {
  const asOf =
    summary.entryDate === summary.asOfDate
      ? `as of ${formatRateDate(summary.asOfDate)}`
      : `calculated ${formatRateDate(summary.asOfDate)}, for entry ${formatRateDate(summary.entryDate)}`;
  const ours = (
    <>
      Our estimate <span className="font-semibold tabular-nums">{usd(summary.totalUsd)}</span>{" "}
      <span className="text-neutral-muted">({asOf})</span>
    </>
  );
  const c = summary.comparison;
  if (c == null) return <p className="text-sm text-move-navy">{ours}</p>;
  if (c.kind === "not_quoted") {
    return (
      <p className="text-sm text-move-navy">
        Forwarder didn&apos;t quote duties · {ours}
      </p>
    );
  }
  const higher = c.differenceUsd > 0;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-move-navy">
        Forwarder quoted duties <span className="font-semibold tabular-nums">{usd(c.quotedUsd)}</span> · {ours}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-muted">
        {c.differenceUsd === 0
          ? "Same amount"
          : `Forwarder ${usd(Math.abs(c.differenceUsd))} ${higher ? "higher" : "lower"}`}
        {c.flag && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[#FFE8CC] px-2 py-0.5 font-medium text-[#B15400]"
            data-testid="check-with-forwarder"
          >
            <AlertTriangle aria-hidden="true" className="size-3" />
            Check with forwarder
          </span>
        )}
      </p>
      {c.flag && higher && summary.excludedCount > 0 && (
        <p className="text-xs text-[#92400E]">
          Our estimate leaves out {summary.excludedCount} additional duty program
          {summary.excludedCount === 1 ? "" : "s"}, which may explain part of the gap.
        </p>
      )}
    </div>
  );
}

// The estimate's own labels, always shown with the number.
function Labels({ summary }: { summary: LinkedEstimateSummary }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {summary.excludedCount > 0 && (
        <li className="font-semibold text-[#92400E]">
          EXCLUDES {summary.excludedCount} additional duty program{summary.excludedCount === 1 ? "" : "s"} that may
          apply
        </li>
      )}
      {summary.pendingReview.length > 0 && (
        <li className="text-[#92400E]">Pending expert review: {summary.pendingReview.join(", ")}</li>
      )}
      {summary.lastReviewedOn && (
        <li className="text-neutral-muted">Duty data last reviewed {formatRateDate(summary.lastReviewedOn)}</li>
      )}
      <li className="text-neutral-muted">{ESTIMATE_DISCLAIMER}</li>
    </ul>
  );
}

export type DutyEstimateRow = {
  summary: LinkedEstimateSummary;
  // "Acme Freight · Sea FCL", or "Project" for the project's own estimate.
  title: string;
};

export function DutyEstimatesList({
  rows,
  projectId,
  canWrite,
  emptyText,
}: {
  rows: DutyEstimateRow[];
  projectId: string;
  canWrite: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-neutral-muted">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-neutral-border" data-testid="duty-estimates">
      {rows.map(({ summary, title }) => (
        <li key={summary.estimateId} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-medium break-words text-move-navy">{title}</p>
            <p className="text-xs text-neutral-muted">
              <Link href={`/tariff-calculator/estimates/${summary.estimateId}`} className={linkClass}>
                View estimate
              </Link>
              {summary.earlierCount > 0 && (
                <> · {summary.earlierCount} earlier</>
              )}
            </p>
          </div>
          <Comparison summary={summary} />
          <Labels summary={summary} />
          {summary.changes.length > 0 && (
            <div className="rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]" data-testid="inputs-changed">
              <p className="font-semibold">Inputs changed since this estimate</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {summary.changes.map((change) => (
                  <li key={change.label}>
                    {change.label}: {change.then} → {change.now}
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                The estimate stays as saved.
                {canWrite && summary.changes.every((c) => c.now !== "deleted") && (
                  <>
                    {" "}
                    <Link href={estimateDutiesHref(projectId, summary.quoteId)} className={linkClass}>
                      Create a new estimate
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
