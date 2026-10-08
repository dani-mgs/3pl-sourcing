import { formatCurrency } from "@/lib/currency";
import { NOT_COMPARABLE } from "@/lib/forwarder/cost-comparison";
import { quoteLabel, quoteRoute, quoteTitle } from "@/lib/forwarder/quote-label";
import { freightCostRatioText, invoiceRatioIssue } from "@/lib/forwarder/freight-cost-ratio";
import {
  leadTimeRange,
  type PipelineCounts,
} from "@/lib/forwarder/project-summary";
import type { ComparisonResult } from "./quote-comparison-panel";
import { Detail, Empty, Tile, Value } from "./summary-tile";
import { RateLockedNote } from "./quote-cells";

export type SummaryProject = {
  current_freight_cost_usd: number | null;
  current_incoterm: string | null;
  shipment_mode: string | null;
  shipment_type: string | null;
  current_freight_forwarder: string | null;
  current_lead_time_days: number | null;
  final_incoterm: string | null;
  final_shipment_mode: string | null;
  final_shipment_type: string | null;
  invoice_value: number | null;
  invoice_currency: string | null;
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function terms(...parts: (string | null)[]): string | null {
  const filled = parts.filter(Boolean);
  return filled.length ? filled.join(" · ") : null;
}

function bestNames(best: ComparisonResult[]): string {
  const names = best.map((r) => r.quote.forwarder_name).sort((a, b) => a.localeCompare(b));
  if (names.length === 1) return names[0];
  const shown = `Tie: ${names[0]} & ${names[1]}`;
  return names.length > 2 ? `${shown} +${names.length - 2} more` : shown;
}

// Why there's no headline number, shared by the savings tiles.
function noSavingReason(
  hasQuotes: boolean,
  best: ComparisonResult[],
  baseline: number | null,
): string | null {
  if (!hasQuotes) return "Awaiting quotes";
  if (best.length === 0) return "No comparable quote yet";
  if (best[0].costDifference === NOT_COMPARABLE) {
    return "Not comparable — final terms differ from current";
  }
  if (baseline == null) return "Set current freight cost to compare";
  return null;
}

export function SummaryTiles({
  project,
  best,
  hasQuotes,
  pipeline,
}: {
  project: SummaryProject;
  best: ComparisonResult[];
  hasQuotes: boolean;
  pipeline: PipelineCounts;
}) {
  const baseline = project.current_freight_cost_usd;
  const currentTerms = terms(project.current_incoterm, project.shipment_mode, project.shipment_type);
  const currentLead = leadTimeRange(project.current_lead_time_days, null);
  const finalTermsSet =
    project.final_incoterm != null &&
    project.final_shipment_mode != null &&
    project.final_shipment_type != null;

  const top = best[0] ?? null;
  const topLeads = [...new Set(best.map((r) =>
    leadTimeRange(r.quote.lead_time_min_days, r.quote.lead_time_max_days),
  ))];
  const topLead = topLeads.length === 1 ? topLeads[0] : null;

  const savingReason = noSavingReason(hasQuotes, best, baseline);
  // Freight Cost Ratio: freight over the project's USD invoice value.
  const invoice = { invoice_value: project.invoice_value, invoice_currency: project.invoice_currency };
  const ratioIssue = invoiceRatioIssue(project.invoice_value, project.invoice_currency);
  const currentRatioText = freightCostRatioText(baseline, invoice);
  const bestRatioText = freightCostRatioText(top?.freightCostUsd ?? null, invoice);
  const currentCents = baseline == null ? null : Math.round(baseline * 100);
  const bestCents = top?.freightCostUsd == null ? null : Math.round(top.freightCostUsd * 100);
  const ratioLower = currentCents != null && bestCents != null && bestCents < currentCents;
  const ratioHigher = currentCents != null && bestCents != null && bestCents > currentCents;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Tile label="Current">
        {baseline == null && !currentTerms && !project.current_freight_forwarder && !currentLead ? (
          <Empty>Current shipping not set</Empty>
        ) : (
          <>
            {baseline != null ? (
              <Value>{formatCurrency(baseline, "USD")}</Value>
            ) : (
              <Empty>No current freight cost</Empty>
            )}
            {currentTerms && <Detail>{currentTerms}</Detail>}
            {(project.current_freight_forwarder || currentLead) && (
              <Detail title={project.current_freight_forwarder ?? undefined}>
                {[project.current_freight_forwarder, currentLead].filter(Boolean).join(" · ")}
              </Detail>
            )}
          </>
        )}
      </Tile>

      <Tile label="Best quote">
        {!hasQuotes ? (
          <Empty>Awaiting quotes</Empty>
        ) : !finalTermsSet ? (
          <Empty>Set final terms to rank quotes</Empty>
        ) : !top || top.freightCostUsd == null ? (
          <Empty>No comparable quote yet</Empty>
        ) : (
          <>
            <Value>{formatCurrency(top.freightCostUsd, "USD")}</Value>
            <RateLockedNote quote={top.quote} className="truncate text-xs text-neutral-muted" />
            <p className="line-clamp-2 text-xs text-neutral-muted" title={bestNames(best)}>
              <span className="font-medium text-move-navy">{bestNames(best)}</span>
              {topLead && (
                <>
                  {" · "}
                  <span className="whitespace-nowrap">{topLead}</span>
                </>
              )}
            </p>
            <Detail title={quoteTitle(top.quote)}>{quoteLabel(top.quote)}</Detail>
            {quoteRoute(top.quote) && <Detail>{quoteRoute(top.quote)}</Detail>}
          </>
        )}
      </Tile>

      <Tile label="Saving per shipment">
        {savingReason || typeof top?.costDifference !== "number" ? (
          <Empty>{savingReason ?? "No comparable quote yet"}</Empty>
        ) : (
          <>
            <Value className={top.costDifference < 0 ? "text-danger" : "text-move-green"}>
              {formatCurrency(top.costDifference, "USD")}
              {typeof top.savingPct === "number" && (
                <span className="ml-1.5 text-sm font-medium">({pct(top.savingPct)})</span>
              )}
            </Value>
            <Detail>{top.vsBaseline}</Detail>
          </>
        )}
      </Tile>

      <Tile label="Freight cost ratio">
        {ratioIssue ? (
          <Empty>{ratioIssue}</Empty>
        ) : currentRatioText == null && bestRatioText == null ? (
          <Empty>{hasQuotes ? "No comparable quote yet" : "Awaiting quotes"}</Empty>
        ) : (
          <>
            <Value>
              {currentRatioText != null && bestRatioText != null ? (
                <>
                  {currentRatioText}
                  <span className="mx-1.5 text-sm font-medium text-neutral-muted">→</span>
                  <span className={ratioLower ? "text-move-green" : ratioHigher ? "text-danger" : ""}>
                    {bestRatioText}
                  </span>
                </>
              ) : (
                (currentRatioText ?? bestRatioText)
              )}
            </Value>
            <Detail>
              {currentRatioText != null && bestRatioText != null
                ? "Current → best quote"
                : currentRatioText != null
                  ? "Current · no comparable quote yet"
                  : "Best quote · set current freight cost"}
            </Detail>
            <Detail>Freight ÷ invoice value</Detail>
          </>
        )}
      </Tile>

      <Tile label="Pipeline">
        {pipeline.total === 0 ? (
          <Empty>No forwarders yet</Empty>
        ) : (
          <>
            <Value>
              {pipeline.total}
              <span className="ml-1.5 text-sm font-medium text-neutral-muted">
                forwarder{pipeline.total === 1 ? "" : "s"}
              </span>
            </Value>
            <Detail>
              {pipeline.quoted} quoted · {pipeline.excluded} excluded
            </Detail>
          </>
        )}
      </Tile>
    </div>
  );
}
