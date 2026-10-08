"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import {
  CURRENCIES,
  INCOTERMS,
  SHIPMENT_MODES,
  SHIPMENT_TYPES_BY_MODE,
  isTypeAllowedForMode,
  type ShipmentMode,
} from "@/lib/forwarder/project-fields";
import { OVERALL_ASSESSMENT_OPTIONS, CLIENT_DECISION_OPTIONS, QUOTE_COMPLETENESS_OPTIONS } from "@/lib/forwarder/quote-fields";
import type { QuoteFields } from "@/lib/forwarder/parse-quote-form";
import { mergeQuoteFields } from "@/lib/forwarder/merge-quote-fields";
import {
  formatRateDate,
  isRateStale,
  isUsd,
  rateCaption,
  resolveInitialRate,
  type LatestRates,
  type RateSource,
  type RateState,
} from "@/lib/fx/rate-provenance";
import {
  InputField,
  SelectField,
  TextAreaField,
  UpdatedBadge,
  fieldClass,
  labelClass,
  updatedFieldClass,
} from "../../../../form-fields";
import { createQuote } from "./new/actions";
import { extractQuoteDetails } from "./new/extract-actions";
import { updateQuote } from "./[quoteId]/edit/actions";

export type QuoteFormDefaults = Partial<QuoteFields>;

// Same amber-warning convention used by the 3PL Cost Comparison panel for
// currency-mismatch/pending-baseline notes.
const warningClass =
  "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]";

export function QuoteForm({
  projectId,
  forwarderId,
  quoteId,
  defaultValues = {},
  cancelHref,
  latestRates,
  today,
}: {
  projectId: string;
  forwarderId: string;
  quoteId: string | null;
  defaultValues?: QuoteFormDefaults;
  cancelHref: string;
  // Latest daily rate per currency, loaded with the page.
  latestRates: LatestRates;
  // Server date (UTC), for rate dates and the stale check.
  today: string;
}) {
  const isEdit = quoteId !== null;

  // Local, mutable copy of defaultValues so an edit-mode AI-extraction merge
  // can update the form after mount. formKey forces the uncontrolled field
  // widgets (defaultValue-based) to remount and pick up the new values.
  const [values, setValues] = useState<QuoteFormDefaults>(defaultValues);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [formKey, setFormKey] = useState(0);

  // Mode/type are controlled so the type list can follow the mode, same
  // pattern as the project intake form.
  const [mode, setMode] = useState(defaultValues.shipment_mode ?? "");
  const [type, setType] = useState(defaultValues.shipment_type ?? "");

  // Currency, rate, and the rate's source/date are controlled so the caption
  // updates live. A non-USD rate starts from the forwarder's document, else
  // the latest daily rate, else blank for the user to enter — never 1, never
  // guessed. On edit, the saved rate and its provenance are kept until the
  // user changes the currency or rate, or refreshes it.
  const [currency, setCurrency] = useState<string>(defaultValues.original_currency ?? "USD");
  const [rateState, setRateState] = useState<RateState>(() =>
    isEdit
      ? {
          rate:
            defaultValues.exchange_rate_to_usd != null
              ? String(defaultValues.exchange_rate_to_usd)
              : "1",
          source: (defaultValues.exchange_rate_source as RateSource | null | undefined) ?? null,
          date: defaultValues.exchange_rate_date ?? null,
        }
      : resolveInitialRate({
          currency: defaultValues.original_currency,
          // On a new quote, a pre-filled rate can only have come from an
          // uploaded document.
          documentRate: defaultValues.exchange_rate_to_usd,
          documentDate: defaultValues.quote_date,
          latest: latestRates,
          today,
        }),
  );
  const rate = rateState.rate;
  const [localError, setLocalError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    { error?: string },
    FormData
  >(
    async (_prev, formData) =>
      isEdit
        ? updateQuote(projectId, forwarderId, quoteId, formData)
        : createQuote(projectId, forwarderId, formData),
    {},
  );

  const rateNumber = Number(rate);
  const rateIsNumber = rate.trim() !== "" && Number.isFinite(rateNumber) && rateNumber > 0;
  const rateNeedsManualEntry = !isUsd(currency) && rate.trim() === "";
  const latestForCurrency = isUsd(currency) ? undefined : latestRates[currency];
  const showsLatest =
    latestForCurrency != null &&
    rateState.source === "daily_feed" &&
    rateState.date === latestForCurrency.rateDate &&
    rateIsNumber &&
    rateNumber === latestForCurrency.rateToUsd;
  const rateIsStale =
    rateState.source === "daily_feed" && rateState.date != null && isRateStale(rateState.date, today);

  function changeCurrency(next: string) {
    if (next === currency) return;
    setCurrency(next);
    // A rate never carries over to another currency.
    setRateState(resolveInitialRate({ currency: next, latest: latestRates, today }));
  }

  function typeRate(value: string) {
    // Anything typed over a pre-filled rate is the user's own rate.
    setRateState({ rate: value, source: "manual", date: today });
  }

  function refreshRate() {
    if (!latestForCurrency) return;
    setRateState({
      rate: String(latestForCurrency.rateToUsd),
      source: "daily_feed",
      date: latestForCurrency.rateDate,
    });
  }

  function handleUpload(formData: FormData) {
    setUploadError(null);
    setUploadNotice(null);
    startExtraction(async () => {
      const result = await extractQuoteDetails(formData, values);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      const { merged, changed } = mergeQuoteFields(values, result.fields);

      if (changed.size === 0) {
        setUploadNotice(
          "No new details found in that document — nothing was changed.",
        );
        setUploadOpen(false);
        return;
      }

      setValues(merged);
      setHighlighted(changed);
      setMode(merged.shipment_mode ?? "");
      setType(merged.shipment_type ?? "");
      const nextCurrency = merged.original_currency ?? "USD";
      const documentRate = result.fields.exchange_rate_to_usd;
      setCurrency(nextCurrency);
      // Precedence: a rate stated in the document; else, if the currency
      // changed (or there's no rate yet), the latest daily rate; else keep
      // the quote's current rate and its provenance.
      if (isUsd(nextCurrency) || documentRate != null || nextCurrency !== currency || rate.trim() === "") {
        setRateState(
          resolveInitialRate({
            currency: nextCurrency,
            documentRate,
            documentDate: merged.quote_date,
            latest: latestRates,
            today,
          }),
        );
      }
      setFormKey((k) => k + 1);
      setUploadOpen(false);
      setUploadNotice(
        `Updated ${changed.size} field${changed.size === 1 ? "" : "s"} from "${uploadFileName}" — review before saving.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {isEdit && (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-move-navy">
            Upload a Document to Update
          </h2>
          <p className="mt-1 text-sm text-neutral-muted">
            Accepts .txt, .pdf, or .docx. Fields the document gives a new value
            for are updated and marked &ldquo;Updated&rdquo; — review them
            before saving. Fields it doesn&apos;t mention stay as they are.
          </p>

          {!uploadOpen ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2.5"
                onClick={() => {
                  setUploadNotice(null);
                  setUploadOpen(true);
                }}
              >
                Upload a Document
              </Button>
            </div>
          ) : (
            <form
              action={(formData) => {
                const file = fileInputRef.current?.files?.[0];
                setUploadFileName(file?.name ?? null);
                handleUpload(formData);
              }}
              className="mt-4 flex flex-col gap-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                name="document"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={(e) => setUploadFileName(e.target.files?.[0]?.name ?? null)}
              />

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                >
                  Choose File
                </Button>
                <span className="text-sm text-neutral-muted">
                  {uploadFileName ?? "No file chosen"}
                </span>
              </div>

              {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => {
                    setUploadOpen(false);
                    setUploadError(null);
                  }}
                  disabled={isExtracting}
                >
                  Cancel
                </Button>
                <Button type="submit" className="px-4 py-2.5" disabled={isExtracting}>
                  {isExtracting ? "Extracting..." : "Extract & Merge"}
                </Button>
              </div>
            </form>
          )}

          {uploadNotice && <p className="mt-4 text-sm text-move-navy">{uploadNotice}</p>}
        </div>
      )}

      <form
      // Submitted manually rather than via `action` so React doesn't reset
      // the uncontrolled fields when the server returns an error.
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        if (rateNeedsManualEntry) {
          setLocalError(
            `Enter an exchange rate for ${currency} before saving.`,
          );
          return;
        }
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <div key={formKey} className="contents">
      <SectionCard title="Terms">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="shipment_mode"
            label="Shipment Mode"
            options={SHIPMENT_MODES}
            value={mode}
            updated={highlighted.has("shipment_mode")}
            onChange={(next) => {
              setMode(next);
              if (!isTypeAllowedForMode(next || null, type || null)) setType("");
            }}
          />
          <SelectField
            name="shipment_type"
            label="Shipment Type"
            options={mode ? SHIPMENT_TYPES_BY_MODE[mode as ShipmentMode] : []}
            value={type}
            updated={highlighted.has("shipment_type")}
            onChange={setType}
            disabled={!mode}
            placeholder={mode ? "Select…" : "Choose a mode first"}
          />
          <SelectField
            name="incoterm"
            label="Incoterm"
            options={INCOTERMS}
            defaultValue={values.incoterm}
            updated={highlighted.has("incoterm")}
          />
          <InputField name="origin" label="Origin" defaultValue={values.origin} updated={highlighted.has("origin")} />
          <InputField name="destination" label="Destination" defaultValue={values.destination} updated={highlighted.has("destination")} />
        </div>
      </SectionCard>

      <SectionCard title="Weight & Value">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="actual_weight_kg" label="Actual Weight (kg)" type="number" step="0.001" defaultValue={values.actual_weight_kg} updated={highlighted.has("actual_weight_kg")} />
          <InputField name="chargeable_weight_kg" label="Chargeable Weight (kg)" type="number" step="0.001" defaultValue={values.chargeable_weight_kg} updated={highlighted.has("chargeable_weight_kg")} />
          <InputField name="cbm" label="CBM" type="number" step="0.000001" defaultValue={values.cbm} updated={highlighted.has("cbm")} />
          <InputField name="cost_of_goods_usd" label="Cost of Goods (USD)" type="number" step="0.01" defaultValue={values.cost_of_goods_usd} updated={highlighted.has("cost_of_goods_usd")} />
        </div>
        <p className="mt-2 text-xs text-neutral-muted">
          Cost per kg uses chargeable weight for Air shipments when set, actual weight otherwise.
        </p>
      </SectionCard>

      <SectionCard title="Pricing">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="original_currency"
            label="Currency"
            options={CURRENCIES}
            value={currency}
            updated={highlighted.has("original_currency")}
            onChange={changeCurrency}
          />
          <InputField name="original_amount" label="Amount" type="number" step="0.01" defaultValue={values.original_amount} updated={highlighted.has("original_amount")} />
          <div className="flex flex-col gap-2">
            <label htmlFor="exchange_rate_to_usd" className={labelClass}>
              Exchange Rate to USD
              {highlighted.has("exchange_rate_to_usd") && <UpdatedBadge />}
            </label>
            <input
              id="exchange_rate_to_usd"
              name="exchange_rate_to_usd"
              type="number"
              min="0"
              step="0.0000000001"
              inputMode="decimal"
              value={rate}
              onChange={(e) => typeRate(e.target.value)}
              className={
                rateNeedsManualEntry
                  ? `${fieldClass} border-[#FBBF24]`
                  : highlighted.has("exchange_rate_to_usd")
                    ? `${fieldClass} ${updatedFieldClass}`
                    : fieldClass
              }
            />
            <input type="hidden" name="exchange_rate_source" value={rateState.source ?? ""} />
            <input type="hidden" name="exchange_rate_date" value={rateState.date ?? ""} />
            {!isUsd(currency) && rateIsNumber && rateState.source && (
              <p className="text-xs text-neutral-muted" data-testid="rate-caption">
                {rateCaption(currency, rateNumber, rateState.source, rateState.date)}
              </p>
            )}
            {!isUsd(currency) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-muted">
                <span>Rate is locked when the quote is saved. Use Refresh to update.</span>
                {latestForCurrency && (
                  <button
                    type="button"
                    onClick={refreshRate}
                    disabled={showsLatest}
                    className="rounded font-medium text-move-green outline-none hover:underline focus-visible:ring-2 focus-visible:ring-move-green disabled:cursor-default disabled:text-neutral-muted disabled:no-underline"
                  >
                    {showsLatest ? "Latest rate in use" : "Refresh to latest rate"}
                  </button>
                )}
              </div>
            )}
            {rateIsStale && rateState.date && (
              <p className={warningClass}>
                This daily rate is from {formatRateDate(rateState.date)}, more than 3 business
                days ago — the feed may be behind. Check it before saving.
              </p>
            )}
            {rateNeedsManualEntry && (
              <p className={warningClass}>
                No exchange rate yet — enter the {currency} to USD rate before saving
                {latestForCurrency ? "" : " (no daily rate is available for it)"}.
              </p>
            )}
          </div>
          <InputField name="duties_taxes_usd" label="Duties & Taxes (USD)" type="number" step="0.01" defaultValue={values.duties_taxes_usd} updated={highlighted.has("duties_taxes_usd")} />
          <InputField name="other_charges_usd" label="Other Charges (USD)" type="number" step="0.01" defaultValue={values.other_charges_usd} updated={highlighted.has("other_charges_usd")} />
          <TextAreaField name="other_charges_description" label="Other Charges Description" defaultValue={values.other_charges_description} updated={highlighted.has("other_charges_description")} />
        </div>
      </SectionCard>

      <SectionCard title="Timing">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="lead_time_min_days" label="Lead Time Min (days)" type="number" step="0.1" defaultValue={values.lead_time_min_days} updated={highlighted.has("lead_time_min_days")} />
          <InputField name="lead_time_max_days" label="Lead Time Max (days)" type="number" step="0.1" defaultValue={values.lead_time_max_days} updated={highlighted.has("lead_time_max_days")} />
          <InputField name="quote_date" label="Quote Date" type="date" defaultValue={values.quote_date} updated={highlighted.has("quote_date")} />
          <InputField name="rate_valid_until" label="Rate Valid Until" type="date" defaultValue={values.rate_valid_until} updated={highlighted.has("rate_valid_until")} />
          <InputField name="quote_reference" label="Quote Reference" defaultValue={values.quote_reference} updated={highlighted.has("quote_reference")} />
        </div>
      </SectionCard>

      <SectionCard title="Assessment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="quote_completeness"
            label="Quote Completeness"
            options={QUOTE_COMPLETENESS_OPTIONS}
            defaultValue={values.quote_completeness}
          />
          <SelectField
            name="overall_assessment"
            label="Overall Assessment"
            options={OVERALL_ASSESSMENT_OPTIONS}
            defaultValue={values.overall_assessment}
          />
          <SelectField
            name="client_decision"
            label="Client Decision"
            options={CLIENT_DECISION_OPTIONS}
            defaultValue={values.client_decision}
          />
          <TextAreaField name="key_strength" label="Key Strength" defaultValue={values.key_strength} updated={highlighted.has("key_strength")} />
          <TextAreaField name="key_weakness_risk" label="Key Weakness / Risk" defaultValue={values.key_weakness_risk} updated={highlighted.has("key_weakness_risk")} />
          <TextAreaField name="important_assumption" label="Important Assumption" defaultValue={values.important_assumption} updated={highlighted.has("important_assumption")} />
          <TextAreaField name="notes" label="Notes" defaultValue={values.notes} updated={highlighted.has("notes")} />
        </div>
      </SectionCard>
      </div>

      {(localError || state.error) && (
        <p className="text-sm text-danger" role="alert">
          {localError ?? state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href={cancelHref} />}
          className="px-4 py-2.5"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : isEdit ? "Save Changes" : "Add Quote"}
        </Button>
      </div>
      </form>
    </div>
  );
}
