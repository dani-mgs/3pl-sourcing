import { formatCurrency } from "@/lib/currency";
import { NOT_COMPARABLE } from "@/lib/forwarder/cost-comparison";
import { quoteLabel, quoteRoute, quoteTitle } from "@/lib/forwarder/quote-label";
import { rateValidity } from "@/lib/forwarder/project-summary";
import type { RequirementFit } from "@/lib/forwarder/requirement-fit";
import {
  ATTENTION_TEXT,
  LeadTimeCell,
  RateLockedNote,
  rankLabel,
  type ComparisonResult,
} from "../../quote-cells";
import { Detail, Empty, Tile, Value } from "../../summary-tile";

export type ForwarderSummary = {
  // This forwarder's best ranked quote, or its lowest-priced quote when none
  // is ranked (ranked = false). Null when nothing is priced.
  headline: ComparisonResult | null;
  ranked: boolean;
  // Why nothing is ranked; null when the headline is ranked.
  unrankedReason: string | null;
  position: { rank: number; of: number; tiedWith: string[] } | null;
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function Validity({ validUntil, today }: { validUntil: string | null; today: string }) {
  const validity = rateValidity(validUntil, today);
  if (validity.kind === "none" || !validUntil) return <Detail>No rate validity date</Detail>;
  const date = dateFormat.format(new Date(`${validUntil}T00:00:00Z`));
  if (validity.kind === "expired") {
    return <p className="truncate text-xs text-danger">Rate expired {date}</p>;
  }
  if (validity.kind === "soon") {
    return (
      <p className={`truncate text-xs ${ATTENTION_TEXT}`}>
        {validity.daysLeft === 0 ? "Rate expires today" : `Rate expires in ${validity.daysLeft} d`} ({date})
      </p>
    );
  }
  return <Detail>Rate valid until {date}</Detail>;
}

export function ForwarderSummaryTiles({
  summary,
  baseline,
  effectiveAnnualShipments,
  targetLeadTime,
  today,
  fit,
}: {
  summary: ForwarderSummary;
  baseline: number | null;
  effectiveAnnualShipments: number | null;
  targetLeadTime: number | null;
  today: string;
  fit: RequirementFit;
}) {
  const { headline, ranked, unrankedReason, position } = summary;
  // A middle rank has no label ("—"); the "#k of N" headline says it all.
  const positionLabel = headline ? rankLabel(headline.quote, headline) : "—";
  const quote = headline?.quote ?? null;
  const confirmedCount = fit.requirements.filter((r) => r.confirmed).length;
  const unconfirmed = fit.requirements.filter((r) => !r.confirmed);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Tile label="Best quote">
        {headline && ranked && headline.freightCostUsd != null ? (
          <>
            <Value>{formatCurrency(headline.freightCostUsd, "USD")}</Value>
            <RateLockedNote quote={headline.quote} className="truncate text-xs text-neutral-muted" />
            <Detail title={quoteTitle(headline.quote)}>{quoteLabel(headline.quote)}</Detail>
            {quoteRoute(headline.quote) && <Detail>{quoteRoute(headline.quote)}</Detail>}
          </>
        ) : (
          <>
            <Empty>{unrankedReason}</Empty>
            {headline?.freightCostUsd != null && (
              <>
                <p className="line-clamp-2 text-xs text-neutral-muted" title={quoteTitle(headline.quote)}>
                  Lowest quote {formatCurrency(headline.freightCostUsd, "USD")} (unranked) ·{" "}
                  {quoteTitle(headline.quote)}
                </p>
                <RateLockedNote quote={headline.quote} className="truncate text-xs text-neutral-muted" />
              </>
            )}
          </>
        )}
      </Tile>

      <Tile label="Position">
        {headline && position ? (
          <>
            <Value>
              #{position.rank}
              <span className="ml-1.5 text-sm font-medium text-neutral-muted">
                of {position.of} quote{position.of === 1 ? "" : "s"}
              </span>
            </Value>
            {positionLabel !== "—" && <Detail>{positionLabel}</Detail>}
            {position.tiedWith.length > 0 && (
              <p className="line-clamp-2 text-xs text-neutral-muted" title={position.tiedWith.join(", ")}>
                Tied with {position.tiedWith.join(", ")}
              </p>
            )}
          </>
        ) : (
          <Empty>{unrankedReason}</Empty>
        )}
      </Tile>

      <Tile label="vs Baseline">
        {!headline ? (
          <Empty>{unrankedReason}</Empty>
        ) : headline.costDifference === NOT_COMPARABLE ? (
          <Empty>Not comparable — terms differ from current</Empty>
        ) : baseline == null ? (
          <Empty>Set current freight cost to compare</Empty>
        ) : typeof headline.costDifference !== "number" ? (
          <Empty>No priced quote yet</Empty>
        ) : (
          <>
            <Value className={headline.costDifference < 0 ? "text-danger" : "text-move-green"}>
              {formatCurrency(headline.costDifference, "USD")}
              {typeof headline.savingPct === "number" && (
                <span className="ml-1.5 text-sm font-medium">({pct(headline.savingPct)})</span>
              )}
            </Value>
            <Detail>{headline.vsBaseline} · per shipment</Detail>
            <Detail>
              {typeof headline.annualCostDifference === "number" && effectiveAnnualShipments != null
                ? `${formatCurrency(headline.annualCostDifference, "USD")} / yr on ${numberFormat.format(effectiveAnnualShipments)} shipments`
                : "Set shipment volume to estimate annual"}
            </Detail>
          </>
        )}
      </Tile>

      <Tile label="Lead time · Validity">
        {!quote ? (
          <Empty>{unrankedReason}</Empty>
        ) : (
          <>
            {quote.lead_time_min_days == null && quote.lead_time_max_days == null ? (
              <Empty>No lead time given</Empty>
            ) : (
              <p className="font-display text-xl font-semibold">
                <LeadTimeCell quote={quote} target={targetLeadTime} />
              </p>
            )}
            {targetLeadTime != null && (
              <Detail>Target {numberFormat.format(targetLeadTime)} d</Detail>
            )}
            <Validity validUntil={quote.rate_valid_until} today={today} />
          </>
        )}
      </Tile>

      <Tile label="Requirement fit">
        {fit.requirements.length === 0 ? (
          <Empty>No requirements set on project</Empty>
        ) : (
          <>
            <Value>
              {confirmedCount}
              <span className="ml-1.5 text-sm font-medium text-neutral-muted">
                of {fit.requirements.length} confirmed
              </span>
            </Value>
            {unconfirmed.length === 0 ? (
              <Detail>All requirements confirmed</Detail>
            ) : (
              <p className={`line-clamp-2 text-xs ${ATTENTION_TEXT}`}>
                Not confirmed: {unconfirmed.map((r) => r.label).join(", ")}
              </p>
            )}
          </>
        )}
      </Tile>
    </div>
  );
}
