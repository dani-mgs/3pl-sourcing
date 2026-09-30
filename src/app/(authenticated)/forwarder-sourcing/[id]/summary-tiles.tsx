import { formatCurrency } from "@/lib/currency";
import { NOT_COMPARABLE } from "@/lib/forwarder/cost-comparison";
import {
  freightInvoiceRatio,
  leadTimeRange,
  type PipelineCounts,
} from "@/lib/forwarder/project-summary";
import type { ComparisonResult } from "./quote-comparison-panel";
import { Detail, Empty, Tile, Value } from "./summary-tile";

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

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

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
  rankedGroupCount,
  hasQuotes,
  effectiveAnnualShipments,
  pipeline,
}: {
  project: SummaryProject;
  best: ComparisonResult[];
  rankedGroupCount: number;
  hasQuotes: boolean;
  effectiveAnnualShipments: number | null;
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
  const currentRatio = freightInvoiceRatio(baseline, project.invoice_value, project.invoice_currency);
  const bestRatio = freightInvoiceRatio(
    top?.freightCostUsd ?? null,
    project.invoice_value,
    project.invoice_currency,
  );

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
            <p className="line-clamp-2 text-xs text-neutral-muted" title={bestNames(best)}>
              <span className="font-medium text-move-navy">{bestNames(best)}</span>
              {topLead && (
                <>
                  {" · "}
                  <span className="whitespace-nowrap">{topLead}</span>
                </>
              )}
            </p>
            <Detail title={top.quote.scenario_group}>
              {top.quote.scenario_group}
              {rankedGroupCount > 1 && (
                <span className="ml-1.5 rounded-full bg-neutral-bg px-1.5 py-0.5 text-[11px]">
                  1 of {rankedGroupCount} scenarios
                </span>
              )}
            </Detail>
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
        {(currentRatio != null || bestRatio != null) && (
          <Detail>
            Freight / invoice:{" "}
            {currentRatio != null && bestRatio != null
              ? `${pct(currentRatio)} → ${pct(bestRatio)}`
              : currentRatio != null
                ? `${pct(currentRatio)} now`
                : `${pct(bestRatio!)} best quote`}
          </Detail>
        )}
      </Tile>

      <Tile label="Annual saving">
        {effectiveAnnualShipments == null ? (
          <Empty>Set shipment volume to estimate</Empty>
        ) : savingReason || typeof top?.annualCostDifference !== "number" ? (
          <>
            <Empty>{savingReason ?? "No comparable quote yet"}</Empty>
            <Detail>{numberFormat.format(effectiveAnnualShipments)} shipments / yr</Detail>
          </>
        ) : (
          <>
            <Value className={top.annualCostDifference < 0 ? "text-danger" : "text-move-green"}>
              {formatCurrency(top.annualCostDifference, "USD")}
            </Value>
            <Detail>on {numberFormat.format(effectiveAnnualShipments)} shipments / yr</Detail>
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
