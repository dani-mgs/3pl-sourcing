"use client";

import Link from "next/link";
import { useActionState, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
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
import {
  DEDUCTION_NOTE,
  DEDUCTION_PROMPT,
  QUANTITY_HINT,
  type CustomsValueBasis,
  type Prefill,
} from "@/lib/tariff/forwarder-link";
import { lookupHref } from "@/lib/tariff/hts-lookup";
import type { LinkConfirmation } from "@/lib/tariff/parse-estimate-form";
import type { LinkedFormContext } from "@/lib/tariff/server-forwarder-link";
import { fieldClass, labelClass } from "../forwarder-sourcing/form-fields";
import { previewEstimate, saveEstimate, type PreviewState, type SaveState } from "./actions";
import { EstimateResultView, WARNING_BOX_CLASS } from "./estimate-result";

const hintClass = "text-xs text-neutral-muted";
const usd = (amount: number) => formatCurrency(amount, "USD");

// "Confirmed" tick beside a pre-filled input (linked estimates only).
function ConfirmBox({
  name,
  checked,
  onChange,
  children = "Confirmed",
}: {
  name: LinkConfirmation;
  checked: boolean;
  onChange: (name: LinkConfirmation, checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <label className="flex w-fit items-center gap-2 text-xs font-medium text-move-navy">
      <input
        type="checkbox"
        name={`confirm_${name}`}
        checked={checked}
        onChange={(e) => onChange(name, e.target.checked)}
        className="size-4 accent-move-green"
      />
      {children}
    </label>
  );
}

function FromProject({ children }: { children: ReactNode }) {
  return <p className={hintClass}>{children}</p>;
}

export function EstimateForm({
  latestRates,
  today,
  countries,
  link,
  pickedHts,
}: {
  latestRates: LatestRates;
  today: string;
  // Named on the server: Intl country names differ between Node and browsers
  // ("Falkland Islands (Islas Malvinas)"), which would break hydration.
  countries: readonly { code: string; name: string }[];
  // Set when opened from a forwarder project or quote: every input is a
  // suggestion the user must confirm before calculating.
  link?: LinkedFormContext;
  // An unlinked form opened from HTS lookup ("Use this code").
  pickedHts?: Prefill["hts"];
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

  const prefill = link?.prefill;
  const basisOptions = prefill?.customsValue.options ?? [];
  const initialBasis = basisOptions.find((o) => o.key === prefill?.customsValue.defaultBasis);

  const [basis, setBasis] = useState<CustomsValueBasis | null>(initialBasis?.key ?? null);
  const [amount, setAmount] = useState(initialBasis?.amount ?? "");
  // A linked estimate whose invoice has no currency starts with none chosen.
  const [currency, setCurrency] = useState(link ? (initialBasis ? (initialBasis.currency ?? "") : "USD") : "USD");
  const [rateState, setRateState] = useState<RateState>(initialBasis?.rate ?? { rate: "1", source: null, date: null });
  const [deduction, setDeduction] = useState(prefill?.deduction?.suggestedUsd ?? "");
  const [quantity, setQuantity] = useState(prefill?.quantity?.suggested ?? "");
  // The HTS suggestion: the project's code, or one chosen in HTS lookup.
  const htsPrefill = prefill?.hts ?? pickedHts;
  const htsControlled = Boolean(link || pickedHts);
  const [htsValue, setHtsValue] = useState(htsPrefill?.value ?? "");
  const [confirmed, setConfirmed] = useState<Set<LinkConfirmation>>(new Set());

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
    setRateState(next ? resolveInitialRate({ currency: next, latest: latestRates, today }) : { rate: "", source: "manual", date: today });
  }

  function chooseBasis(key: CustomsValueBasis) {
    const option = basisOptions.find((o) => o.key === key);
    if (!option) return;
    setBasis(key);
    setAmount(option.amount);
    setCurrency(option.currency ?? "");
    setRateState(option.rate);
  }

  function confirm(name: LinkConfirmation, checked: boolean) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  // The customs value the estimate will use, shown live (the server
  // recalculates it exactly).
  const amountNumber = Number(amount);
  const deductionNumber = deduction.trim() === "" ? 0 : Number(deduction);
  const goodsUsd =
    amount.trim() !== "" && Number.isFinite(amountNumber) && currency !== "" && (isUsd(currency) || rateIsNumber)
      ? Math.round(amountNumber * (isUsd(currency) ? 1 : rateNumber) * 100) / 100
      : null;
  const finalCustomsValue =
    goodsUsd != null && Number.isFinite(deductionNumber) ? Math.round((goodsUsd - deductionNumber) * 100) / 100 : null;

  const required: LinkConfirmation[] = ["hts", "origin", "customs_value", "mode"];
  if (prefill?.deduction) required.push("deduction");
  if (quantity.trim() !== "") required.push("quantity");
  const allConfirmed = !link || required.every((key) => confirmed.has(key));

  const result = preview.result;
  const canSave = Boolean(result) && !editedSinceResult && !preview.error && allConfirmed;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="self-start rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Shipment line</h2>

        {link && (
          <div className="mb-5 rounded-xl border border-neutral-border bg-neutral-bg px-4 py-3 text-sm" data-testid="link-banner">
            <Link
              href={link.backHref}
              className="mb-1 inline-flex items-center gap-1 rounded text-xs text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Back
            </Link>
            <p className="font-medium text-move-navy">Pre-filled from {link.title}</p>
            <p className="mt-1 text-xs text-neutral-muted">
              Every value below is a suggestion. Check each one and tick Confirmed; nothing is calculated or saved
              until you do. The estimate will be linked to this {link.quoteId ? "quote" : "project"}.
            </p>
            {link.quoteId && (
              <p className="mt-1 text-xs text-neutral-muted">
                {link.quotedDutiesUsd == null
                  ? "Forwarder didn't quote duties."
                  : `Forwarder quoted duties ${usd(link.quotedDutiesUsd)} (for comparison only).`}
              </p>
            )}
          </div>
        )}

        <form onSubmit={submit} onChange={() => setEditedSinceResult(true)} className="flex flex-col gap-4">
          {link && (
            <>
              <input type="hidden" name="forwarder_project_id" value={link.projectId} />
              <input type="hidden" name="forwarder_quote_id" value={link.quoteId ?? ""} />
              <input type="hidden" name="source_version" value={link.sourceVersion} />
            </>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <label htmlFor="hts_code" className={labelClass}>
                HTS code
              </label>
              <Link
                href={lookupHref(link ? { project: link.projectId, quote: link.quoteId } : null)}
                className="rounded text-xs font-medium text-move-navy outline-none hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green"
              >
                Look up HTS code
              </Link>
            </div>
            <input
              id="hts_code"
              name="hts_code"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 7208.10.15.00"
              aria-describedby="hts_code_hint"
              value={htsControlled ? htsValue : undefined}
              onChange={htsControlled ? (e) => setHtsValue(e.target.value) : undefined}
              className={fieldClass}
            />
            {htsPrefill && (
              <>
                {htsPrefill.projectText && <FromProject>Project HS code: {htsPrefill.projectText}</FromProject>}
                {htsPrefill.fromLookup && (
                  <p className={hintClass} data-testid="hts-from-lookup">
                    {link
                      ? "Chosen in HTS lookup. It's used for this estimate only; the project's HS code isn't changed."
                      : "Chosen in HTS lookup."}
                  </p>
                )}
                {htsPrefill.description && htsValue === htsPrefill.value && (
                  <div className="rounded-lg bg-neutral-bg px-3 py-2 text-xs text-move-navy" data-testid="hts-description">
                    <span className="text-neutral-muted">Official description: </span>
                    {htsPrefill.ancestorDescriptions.length > 0 && (
                      <span className="text-neutral-muted">
                        {htsPrefill.ancestorDescriptions.map((d) => d.replace(/:\s*$/, "")).join(" › ")} ›{" "}
                      </span>
                    )}
                    <span className="font-medium">{htsPrefill.description}</span>
                    <span className="block text-neutral-muted">Confirm this matches the goods.</span>
                  </div>
                )}
                {htsPrefill.warning && <p className={`${WARNING_BOX_CLASS} text-xs`}>{htsPrefill.warning}</p>}
              </>
            )}
            <p id="hts_code_hint" className={hintClass}>
              8 or 10 digits (10 recommended). Classification is the importer&apos;s responsibility: the
              estimate uses the code you enter and doesn&apos;t check it.
            </p>
            {link && <ConfirmBox name="hts" checked={confirmed.has("hts")} onChange={confirm} />}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="origin_country" className={labelClass}>
                Country of origin
              </label>
              <select
                id="origin_country"
                name="origin_country"
                required
                defaultValue={prefill?.origin.value ?? ""}
                className={fieldClass}
              >
                <option value="" disabled>
                  Choose a country
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {prefill?.origin.projectText && <FromProject>Project origin: {prefill.origin.projectText}</FromProject>}
              {prefill?.origin.note && <p className={`${WARNING_BOX_CLASS} text-xs`}>{prefill.origin.note}</p>}
              {link && <ConfirmBox name="origin" checked={confirmed.has("origin")} onChange={confirm} />}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="shipment_mode" className={labelClass}>
                Shipment mode
              </label>
              <select
                id="shipment_mode"
                name="shipment_mode"
                required
                defaultValue={link ? prefill!.mode.value : "Sea"}
                className={fieldClass}
              >
                {link && (
                  <option value="" disabled>
                    Choose a mode
                  </option>
                )}
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              {prefill?.mode.from && (
                <FromProject>From the {prefill.mode.from}. HMF applies to Sea only.</FromProject>
              )}
              {link && <ConfirmBox name="mode" checked={confirmed.has("mode")} onChange={confirm} />}
            </div>
          </div>

          {basisOptions.length > 1 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className={`${labelClass} mb-1`}>Customs value basis</legend>
              {basisOptions.map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-sm text-move-navy">
                  <input
                    type="radio"
                    name="customs_value_basis"
                    value={option.key}
                    checked={basis === option.key}
                    onChange={() => chooseBasis(option.key)}
                    className="accent-move-green"
                  />
                  {option.label}:{" "}
                  {option.currency ? formatCurrency(Number(option.amount), option.currency) : `${option.amount} (no currency)`}
                </label>
              ))}
              <p className={hintClass}>
                Use the quote&apos;s cost of goods only if it&apos;s the price paid for the goods.
              </p>
            </fieldset>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="customs_value" className={labelClass}>
                {prefill?.deduction ? "Goods value (invoice price)" : "Customs value"}
              </label>
              <input
                id="customs_value"
                name="customs_value"
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={link ? amount : undefined}
                onChange={link ? (e) => setAmount(e.target.value) : undefined}
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
                required
                value={currency}
                onChange={(e) => changeCurrency(e.target.value)}
                className={currency === "" ? `${fieldClass} border-[#FBBF24]` : fieldClass}
              >
                {currency === "" && (
                  <option value="" disabled>
                    Choose a currency
                  </option>
                )}
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {prefill?.customsValue.note && <p className={`${WARNING_BOX_CLASS} -mt-2 text-xs`}>{prefill.customsValue.note}</p>}
          <p className={`${hintClass} -mt-2`}>
            Transaction value: the price paid for the goods, excluding international freight, insurance and
            US duties.
          </p>

          {!isUsd(currency) && currency !== "" && (
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

          {prefill?.deduction && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3" data-testid="deduction">
              <label htmlFor="freight_insurance_deduction_usd" className="text-sm font-semibold text-[#92400E]">
                {DEDUCTION_PROMPT}
              </label>
              <p className="text-xs text-[#92400E]">
                The project&apos;s current incoterm is {prefill.deduction.incoterm}, so the supplier&apos;s price
                includes international freight. {DEDUCTION_NOTE}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-move-navy">USD</span>
                <input
                  id="freight_insurance_deduction_usd"
                  name="freight_insurance_deduction_usd"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={deduction}
                  onChange={(e) => setDeduction(e.target.value)}
                  className={`${fieldClass} bg-white`}
                />
              </div>
              <p className="text-xs text-[#92400E]">
                {prefill.deduction.suggestedUsd
                  ? `Suggested: the project's current freight cost (${usd(Number(prefill.deduction.suggestedUsd))}). Edit it to match the invoice; leave it blank to deduct nothing.`
                  : "The project has no current freight cost. Enter the freight and insurance in the invoice price, or leave it blank to deduct nothing."}
              </p>
              <ConfirmBox name="deduction" checked={confirmed.has("deduction")} onChange={confirm}>
                Confirm deduction
              </ConfirmBox>
            </div>
          )}

          {link && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-move-navy" data-testid="final-customs-value">
                Customs value used:{" "}
                <span className="font-semibold tabular-nums">
                  {finalCustomsValue != null && finalCustomsValue > 0 ? usd(finalCustomsValue) : "—"}
                </span>
                {goodsUsd != null && deductionNumber > 0 && (
                  <span className="block text-xs text-neutral-muted">
                    {usd(goodsUsd)} goods value − {usd(deductionNumber)} freight and insurance
                  </span>
                )}
              </p>
              {finalCustomsValue != null && finalCustomsValue <= 0 && (
                <p className={`${WARNING_BOX_CLASS} text-xs`}>The deduction is more than the goods value.</p>
              )}
              <ConfirmBox name="customs_value" checked={confirmed.has("customs_value")} onChange={confirm} />
            </div>
          )}

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
              value={link ? quantity : undefined}
              onChange={link ? (e) => setQuantity(e.target.value) : undefined}
              className={fieldClass}
            />
            {prefill?.quantity && (
              <p className={`${WARNING_BOX_CLASS} text-xs`}>
                The rate is charged per {prefill.quantity.unitLabel}.{" "}
                {prefill.quantity.from === "weight_kg" && "Suggested from the project's weight (kg). "}
                {prefill.quantity.from === "units" && "Suggested from the project's units. "}
                {QUANTITY_HINT}
              </p>
            )}
            <p id="quantity_hint" className={hintClass}>
              Needed when the rate is charged per kg, liter, pair, etc. Use the rate&apos;s unit; HTS weights
              are net, not gross.
            </p>
            {link && quantity.trim() !== "" && (
              <ConfirmBox name="quantity" checked={confirmed.has("quantity")} onChange={confirm} />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="label" className={labelClass}>
              Reference <span className="font-normal text-neutral-muted">(optional, saved with the estimate)</span>
            </label>
            <input
              id="label"
              name="label"
              maxLength={200}
              placeholder="e.g. client or PO"
              defaultValue={link?.title ?? undefined}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              value="preview"
              disabled={previewing || saving || !allConfirmed}
              className="px-4 py-2.5"
            >
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
                {saving ? "Saving..." : link ? `Save to ${link.quoteId ? "quote" : "project"}` : "Save estimate"}
              </Button>
            )}
          </div>
          {!allConfirmed && (
            <p className={hintClass} data-testid="confirm-hint">
              Tick Confirmed beside each input to calculate.
            </p>
          )}
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
