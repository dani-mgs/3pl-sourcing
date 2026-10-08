import { formatCurrency } from "@/lib/currency";
import { NOT_COMPARABLE, isExcludedFromRanking } from "@/lib/forwarder/cost-comparison";
import type {
  ComparisonQuote,
  ComparisonResult,
} from "@/lib/forwarder/load-project-comparison";
import { rateLockedNote } from "@/lib/fx/rate-provenance";
import { quoteLabel, quoteRoute } from "@/lib/forwarder/quote-label";
import { freightCostRatioText, type InvoiceBasis } from "@/lib/forwarder/freight-cost-ratio";
import {
  exceedsTargetLeadTime,
  leadTimeRange,
  rateValidity,
} from "@/lib/forwarder/project-summary";

// Table cells shared by the Project Summary's Quote Comparison and the
// forwarder detail page's Quotes table, so a quote reads the same in both.

export type { ComparisonQuote, ComparisonResult };

// Accessible text on white for "attention" states; Move Orange itself is too
// light for text, so it's used only for the small indicator dot.
export const ATTENTION_TEXT = "text-[#B15400]";

// differentTerms: the quote's terms differ from the project's final terms
// (hasDifferentTerms), which is the usual reason a quote isn't ranked.
export function rankLabel(
  quote: ComparisonQuote,
  result: ComparisonResult,
  differentTerms = false,
): string {
  if (result.rankPosition === NOT_COMPARABLE) {
    return differentTerms ? "Different terms" : "Not Comparable";
  }
  if (isExcludedFromRanking(quote)) return "Excluded from ranking";
  return result.rankPosition ?? "—";
}

// A quote's terms ("DDP · Sea · FCL") and lane ("Origin → Destination"), so a
// quote for a different route or with different terms stands out.
export function QuoteIdentity({ quote }: { quote: ComparisonQuote }) {
  const route = quoteRoute(quote);
  return (
    <>
      <span className="block text-xs text-move-navy">{quoteLabel(quote)}</span>
      {route && <span className="block text-xs text-neutral-muted">{route}</span>}
    </>
  );
}

export function VsBaselineCell({ result }: { result: ComparisonResult }) {
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

// Freight / project invoice value, for every quote that has a price (ranked or
// not: it's the USD freight shown in the Freight Cost column). "—" when the
// project's invoice value is missing or isn't in USD.
export function FreightCostRatioCell({
  result,
  invoice,
}: {
  result: ComparisonResult;
  invoice: InvoiceBasis;
}) {
  const text = freightCostRatioText(result.freightCostUsd, invoice);
  return text ? (
    <span className="whitespace-nowrap tabular-nums">{text}</span>
  ) : (
    <span className="text-neutral-muted">—</span>
  );
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
// showOriginal adds the quoted amount when it wasn't in USD.
export function FreightCell({
  result,
  scale,
  baseline,
  showOriginal = false,
}: {
  result: ComparisonResult;
  scale: number | null;
  baseline: number | null;
  showOriginal?: boolean;
}) {
  if (result.freightCostUsd == null) {
    return <span className="text-neutral-muted">—</span>;
  }
  const { quote } = result;
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
      {showOriginal && quote.original_currency !== "USD" && quote.original_amount != null && (
        <span className="mt-1 block text-xs whitespace-nowrap tabular-nums text-neutral-muted">
          Quoted {formatCurrency(quote.original_amount, quote.original_currency)}
        </span>
      )}
      <RateLockedNote quote={quote} />
      {result.costPerKg != null && (
        <span className="mt-1 block text-xs whitespace-nowrap tabular-nums text-neutral-muted">
          {formatCurrency(result.costPerKg, "USD")} / kg
        </span>
      )}
    </div>
  );
}

// "rate locked Oct 1, 2026" under a converted USD amount; nothing for USD.
export function RateLockedNote({
  quote,
  className = "mt-1 block text-xs whitespace-nowrap text-neutral-muted",
}: {
  quote: Pick<ComparisonQuote, "original_currency" | "exchange_rate_source" | "exchange_rate_date">;
  className?: string;
}) {
  const note = rateLockedNote(quote.original_currency, quote.exchange_rate_source, quote.exchange_rate_date);
  if (!note) return null;
  return (
    <span className={className} title={note.title}>
      {note.text}
    </span>
  );
}

export function LeadTimeCell({ quote, target }: { quote: ComparisonQuote; target: number | null }) {
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

export function ValidUntilCell({ validUntil, today }: { validUntil: string | null; today: string }) {
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

