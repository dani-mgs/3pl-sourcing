import { AlertTriangle, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { DAILY_FEED_ATTRIBUTION, formatRateDate, rateCaption } from "@/lib/fx/rate-provenance";
import { ESTIMATE_CAVEATS, ESTIMATE_DISCLAIMER, ESTIMATE_DISCLAIMER_DETAIL } from "@/lib/tariff/caveats";
import { countryName } from "@/lib/tariff/countries";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { excludedPrograms, totalLabel } from "@/lib/tariff/programs";
import type { EstimateResult } from "@/lib/tariff/server-estimate";

// One estimate's breakdown: the live preview and a saved (locked) estimate
// both render this, so they always show the same disclaimer, sources,
// warnings and caveats. No hooks, so it renders on the server or the client.

const usd = (amount: number) => formatCurrency(amount, "USD");

// "Footwear:" › "Other:" → "Footwear › Other".
const breadcrumb = (descriptions: string[]) => descriptions.map((d) => d.replace(/:\s*$/, "")).join(" › ");

const linkClass =
  "inline-flex items-center gap-1 rounded font-medium text-move-navy underline decoration-neutral-border underline-offset-2 outline-none hover:decoration-move-green focus-visible:ring-2 focus-visible:ring-move-green";

// The app's amber-warning convention (quote form, 3PL Cost Comparison).
export const WARNING_BOX_CLASS =
  "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]";

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {label}
      <ExternalLink aria-hidden="true" className="size-3" />
    </a>
  );
}

export function EstimateDisclaimer() {
  return (
    <div className={WARNING_BOX_CLASS} role="note">
      <p className="font-semibold">{ESTIMATE_DISCLAIMER}</p>
      <p className="mt-1">{ESTIMATE_DISCLAIMER_DETAIL}</p>
    </div>
  );
}

export function EstimateCaveats() {
  return (
    <details className="group rounded-xl border border-neutral-border px-4 py-3 text-sm open:bg-neutral-bg/60">
      <summary className="cursor-pointer font-medium text-move-navy outline-none marker:text-neutral-muted focus-visible:ring-2 focus-visible:ring-move-green">
        What this estimate doesn&apos;t include
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-move-navy marker:text-neutral-muted">
        {ESTIMATE_CAVEATS.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
    </details>
  );
}

// The total, labelled as excluding any additional-duty programs that may
// apply, with those programs listed right under it so the number can't read
// as complete.
function EstimateTotal({ estimate }: { estimate: EstimateResult }) {
  const excluded = excludedPrograms(estimate.warnings, estimate.customsValueUsd);
  const hasExclusions = excluded.length > 0;
  return (
    <div
      className={
        hasExclusions
          ? "rounded-xl border border-[#FBBF24] bg-neutral-bg px-4 py-3"
          : "rounded-xl bg-neutral-bg px-4 py-3"
      }
    >
      <p
        className={hasExclusions ? "text-xs font-semibold text-[#92400E]" : "text-xs text-neutral-muted"}
        data-testid="estimate-total-label"
      >
        {totalLabel(excluded.length, estimate.additionalDutiesUsd > 0)}
      </p>
      <p className="font-display text-2xl font-semibold" data-testid="estimate-total">
        {usd(estimate.totalUsd)}
      </p>
      <p className="mt-1 text-xs text-neutral-muted">
        Base duty {usd(estimate.baseDutyUsd)}
        {estimate.additionalDutiesUsd > 0 && <> · Additional duties {usd(estimate.additionalDutiesUsd)}</>} · Fees{" "}
        {usd(estimate.feesUsd)} · Customs value {usd(estimate.customsValueUsd)}
      </p>
      {hasExclusions && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-[#FBBF24]/60 pt-2 text-xs text-[#92400E]">
          {excluded.map((program) => (
            <li key={program.programKey} className="flex items-start gap-1.5">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span>
                <span className="font-medium">Not included: {program.name}</span>
                {program.hint && <> — {program.hint}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Who last reviewed the duty data behind this estimate, per program, and a
// prominent warning when a review may be out of date.
function DutyDataReviews({ estimate }: { estimate: EstimateResult }) {
  if (estimate.dutyReviews.length === 0) return null;
  const stale = estimate.dutyReviews.filter((r) => r.staleReason);
  return (
    <div className="flex flex-col gap-2">
      {stale.length > 0 && (
        <div className={WARNING_BOX_CLASS} role="note" data-testid="duty-data-stale">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            Duty data may be out of date
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {stale.map((r) => (
              <li key={r.programKey}>
                {r.name}: {r.staleReason}. Ask a tariff editor to review it.
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-xs text-neutral-muted" data-testid="duty-data-reviews">
        {estimate.dutyReviews.map((r) => (
          <li key={r.programKey}>
            Duty data, {r.name}:{" "}
            {r.status === "reviewed" && r.reviewedAt
              ? `last reviewed ${formatRateDate(r.reviewedAt.slice(0, 10))}${r.reviewedByName ? ` by ${r.reviewedByName}` : ""}`
              : "pending expert review (not counted in the total)"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EstimateResultView({ estimate }: { estimate: EstimateResult }) {
  const isUsd = estimate.currency === "USD";
  const rate = Number(estimate.exchangeRateToUsd);
  const usesDailyFeed = estimate.exchangeRateSource === "daily_feed";

  return (
    <div className="flex flex-col gap-5 text-sm text-move-navy">
      <EstimateDisclaimer />

      <div>
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          HTS {formatHtsCode(estimate.htsCode)} · as entered
        </p>
        {estimate.ancestorDescriptions.length > 0 && (
          // The HTS path can be a paragraph of legal text; two lines, full text on hover.
          <p className="mt-1 line-clamp-2 text-xs text-neutral-muted" title={breadcrumb(estimate.ancestorDescriptions)}>
            {breadcrumb(estimate.ancestorDescriptions)}
          </p>
        )}
        <p className="mt-0.5 font-medium">{estimate.description}</p>
        {estimate.matchedTenDigit && (
          <p className="mt-1 text-xs text-neutral-muted">
            Matched the only 10-digit line under the 8-digit code you entered.
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-muted">
          Origin {countryName(estimate.originCountry)} · {estimate.shipmentMode} · Rates as of{" "}
          {formatRateDate(estimate.asOfDate)}
        </p>
      </div>

      <EstimateTotal estimate={estimate} />

      <DutyDataReviews estimate={estimate} />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Line</th>
              <th scope="col" className="px-4 py-3 font-medium">Rate</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines.map((line) => (
              <tr key={`${line.kind}-${line.code}`} className="border-b border-neutral-border align-top last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{line.label}</p>
                  {line.heading && (
                    <p className="text-xs text-neutral-muted">
                      Chapter 99 heading {line.heading}
                      {line.legalStatus && <> · {line.legalStatus}</>}
                    </p>
                  )}
                  {line.detail && <p className="text-xs text-neutral-muted">{line.detail}</p>}
                  <p className="mt-0.5 text-xs text-neutral-muted">
                    Source: <SourceLink label={line.sourceLabel} url={line.sourceUrl} />
                    {line.effectiveFrom && <> · in effect from {formatRateDate(line.effectiveFrom)}</>}
                    {line.effectiveTo && <> to {formatRateDate(line.effectiveTo)}</>}
                    {line.sourceCheckedOn && <> · source checked {formatRateDate(line.sourceCheckedOn)}</>}
                  </p>
                  {line.notes && line.notes.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[#92400E]">
                      {line.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3">{line.rateText}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{usd(line.amountUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimate.deductionUsd != null ? (
        // Linked estimate with delivered terms: goods value, less the freight
        // and insurance the user confirmed, is the customs value.
        <div className="text-xs text-neutral-muted" data-testid="customs-value-breakdown">
          <p>
            Goods value {formatCurrency(Number(estimate.customsValueOriginal), estimate.currency)}
            {!isUsd && estimate.exchangeRateSource && (
              <>
                {" "}
                → {usd(estimate.customsValueUsd + estimate.deductionUsd)} at{" "}
                {rateCaption(estimate.currency, rate, estimate.exchangeRateSource, estimate.exchangeRateDate)}
              </>
            )}
          </p>
          <p>Less international freight and insurance (confirmed by the user): {usd(estimate.deductionUsd)}</p>
          <p className="font-medium text-move-navy">Customs value {usd(estimate.customsValueUsd)}</p>
          {usesDailyFeed && <p className="mt-0.5">{DAILY_FEED_ATTRIBUTION}</p>}
        </div>
      ) : (
        !isUsd &&
        estimate.exchangeRateSource && (
          <div className="text-xs text-neutral-muted">
            <p>
              Customs value {formatCurrency(Number(estimate.customsValueOriginal), estimate.currency)} →{" "}
              {usd(estimate.customsValueUsd)} at{" "}
              {rateCaption(estimate.currency, rate, estimate.exchangeRateSource, estimate.exchangeRateDate)}
            </p>
            {usesDailyFeed && <p className="mt-0.5">{DAILY_FEED_ATTRIBUTION}</p>}
          </div>
        )
      )}

      {estimate.specialRateText && (
        <p className="text-xs text-neutral-muted">
          Special programs listed in the HTS (not applied): {estimate.specialRateText}
        </p>
      )}

      {estimate.warnings.length > 0 && (
        <div className={WARNING_BOX_CLASS}>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            Additional duties not included in this estimate
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {estimate.warnings.map((warning) => (
              <li key={warning.programKey}>
                <span className="font-medium">{warning.name}:</span> {warning.text}{" "}
                <SourceLink label={warning.sourceLabel} url={warning.sourceUrl} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <EstimateCaveats />
    </div>
  );
}
