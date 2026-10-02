"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CURRENCIES } from "@/lib/forwarder/project-fields";
import {
  formatRateDate,
  isRateStale,
  isUsd,
  rateCaption,
  resolveInitialRate,
  type LatestRates,
  type RateState,
} from "@/lib/fx/rate-provenance";
import { SHIPMENT_MODES } from "@/lib/tariff/calculate";
import { fieldClass, labelClass } from "../forwarder-sourcing/form-fields";
import { previewEstimate, saveEstimate, type PreviewState, type SaveState } from "./actions";
import { EstimateResultView, WARNING_BOX_CLASS } from "./estimate-result";

const hintClass = "text-xs text-neutral-muted";

export function EstimateForm({
  latestRates,
  today,
  countries,
}: {
  latestRates: LatestRates;
  today: string;
  // Named on the server: Intl country names differ between Node and browsers
  // ("Falkland Islands (Islas Malvinas)"), which would break hydration.
  countries: readonly { code: string; name: string }[];
}) {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(
    async (_prev, formData) => previewEstimate(formData),
    {},
  );
  const [saved, saveAction, saving] = useActionState<SaveState, FormData>(
    async (_prev, formData) => saveEstimate(formData),
    {},
  );

  // A result only matches the inputs it was calculated from; any edit hides
  // Save until the user recalculates.
  const [editedSinceResult, setEditedSinceResult] = useState(false);
  const [, startTransition] = useTransition();

  // Dispatched by hand rather than through <form action>, which would reset
  // the fields after each Calculate and leave Save with an empty form.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget);
    if (submitter?.value === "save") {
      startTransition(() => saveAction(formData));
    } else {
      setEditedSinceResult(false);
      startTransition(() => previewAction(formData));
    }
  }

  const [currency, setCurrency] = useState("USD");
  const [rateState, setRateState] = useState<RateState>({ rate: "1", source: null, date: null });
  const latestForCurrency = isUsd(currency) ? undefined : latestRates[currency];
  const rateNumber = Number(rateState.rate);
  const rateIsNumber = rateState.rate.trim() !== "" && Number.isFinite(rateNumber) && rateNumber > 0;
  const showsLatest =
    latestForCurrency != null &&
    rateState.source === "daily_feed" &&
    rateState.date === latestForCurrency.rateDate &&
    rateNumber === latestForCurrency.rateToUsd;
  const rateIsStale =
    rateState.source === "daily_feed" && rateState.date != null && isRateStale(rateState.date, today);

  function changeCurrency(next: string) {
    setCurrency(next);
    // A rate never carries over to another currency.
    setRateState(resolveInitialRate({ currency: next, latest: latestRates, today }));
  }

  const result = preview.result;
  const canSave = Boolean(result) && !editedSinceResult && !preview.error;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="self-start rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Shipment line</h2>
        <form onSubmit={submit} onChange={() => setEditedSinceResult(true)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="hts_code" className={labelClass}>
              HTS code
            </label>
            <input
              id="hts_code"
              name="hts_code"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 7208.10.15.00"
              aria-describedby="hts_code_hint"
              className={fieldClass}
            />
            <p id="hts_code_hint" className={hintClass}>
              8 or 10 digits (10 recommended). Classification is the importer&apos;s responsibility: the
              estimate uses the code you enter and doesn&apos;t check it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="origin_country" className={labelClass}>
                Country of origin
              </label>
              <select id="origin_country" name="origin_country" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  Choose a country
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="shipment_mode" className={labelClass}>
                Shipment mode
              </label>
              <select id="shipment_mode" name="shipment_mode" required defaultValue="Sea" className={fieldClass}>
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="customs_value" className={labelClass}>
                Customs value
              </label>
              <input
                id="customs_value"
                name="customs_value"
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="original_currency" className={labelClass}>
                Currency
              </label>
              <select
                id="original_currency"
                name="original_currency"
                value={currency}
                onChange={(e) => changeCurrency(e.target.value)}
                className={fieldClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className={`${hintClass} -mt-2`}>
            Transaction value: the price paid for the goods, excluding international freight, insurance and
            US duties.
          </p>

          {!isUsd(currency) && (
            <div className="flex flex-col gap-2">
              <label htmlFor="exchange_rate_to_usd" className={labelClass}>
                Exchange rate to USD
              </label>
              <input
                id="exchange_rate_to_usd"
                name="exchange_rate_to_usd"
                type="number"
                min="0"
                step="0.0000000001"
                inputMode="decimal"
                required
                value={rateState.rate}
                onChange={(e) => setRateState({ rate: e.target.value, source: "manual", date: today })}
                className={rateState.rate.trim() === "" ? `${fieldClass} border-[#FBBF24]` : fieldClass}
              />
              {rateIsNumber && rateState.source && (
                <p className={hintClass}>{rateCaption(currency, rateNumber, rateState.source, rateState.date)}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-muted">
                <span>The rate is locked when the estimate is saved.</span>
                {latestForCurrency && (
                  <button
                    type="button"
                    onClick={() =>
                      setRateState({
                        rate: String(latestForCurrency.rateToUsd),
                        source: "daily_feed",
                        date: latestForCurrency.rateDate,
                      })
                    }
                    disabled={showsLatest}
                    className="rounded font-medium text-move-green outline-none hover:underline focus-visible:ring-2 focus-visible:ring-move-green disabled:cursor-default disabled:text-neutral-muted disabled:no-underline"
                  >
                    {showsLatest ? "Latest rate in use" : "Refresh to latest rate"}
                  </button>
                )}
              </div>
              {rateIsStale && rateState.date && (
                <p className={`${WARNING_BOX_CLASS} text-xs`}>
                  This daily rate is from {formatRateDate(rateState.date)}. Check it or enter a current rate.
                </p>
              )}
            </div>
          )}
          <input type="hidden" name="exchange_rate_source" value={rateState.source ?? ""} />
          <input type="hidden" name="exchange_rate_date" value={rateState.date ?? ""} />

          <div className="flex flex-col gap-2">
            <label htmlFor="quantity" className={labelClass}>
              Quantity <span className="font-normal text-neutral-muted">(per-unit rates only)</span>
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min="0"
              step="0.0001"
              inputMode="decimal"
              aria-describedby="quantity_hint"
              className={fieldClass}
            />
            <p id="quantity_hint" className={hintClass}>
              Needed when the rate is charged per kg, liter, pair, etc. Use the rate&apos;s unit; HTS weights
              are net, not gross.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="label" className={labelClass}>
              Reference <span className="font-normal text-neutral-muted">(optional, saved with the estimate)</span>
            </label>
            <input id="label" name="label" maxLength={200} placeholder="e.g. client or PO" className={fieldClass} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" value="preview" disabled={previewing || saving} className="px-4 py-2.5">
              {previewing ? "Calculating..." : "Calculate"}
            </Button>
            {canSave && (
              <Button
                type="submit"
                value="save"
                variant="outline"
                disabled={previewing || saving}
                className="px-4 py-2.5"
              >
                {saving ? "Saving..." : "Save estimate"}
              </Button>
            )}
          </div>
          {canSave && (
            <p className={hintClass}>
              Saving recalculates with the current data and locks the result with its rates and dates.
            </p>
          )}
          {preview.error && (
            <p role="alert" className="text-sm text-danger">
              {preview.error}
            </p>
          )}
          {saved.error && (
            <p role="alert" className="text-sm text-danger">
              {saved.error}
            </p>
          )}
        </form>
      </section>

      <section
        aria-live="polite"
        className="self-start rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Estimate</h2>
        {result && !preview.error ? (
          <div className={editedSinceResult ? "opacity-60" : undefined}>
            {editedSinceResult && (
              <p className={`${WARNING_BOX_CLASS} mb-4`}>Inputs changed. Calculate again to update this estimate.</p>
            )}
            <EstimateResultView estimate={result} />
          </div>
        ) : (
          <p className="text-sm text-neutral-muted">
            Enter the HTS code, origin, mode and customs value, then Calculate.
          </p>
        )}
      </section>
    </div>
  );
}
