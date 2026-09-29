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
  existingScenarioGroups,
  cancelHref,
}: {
  projectId: string;
  forwarderId: string;
  quoteId: string | null;
  defaultValues?: QuoteFormDefaults;
  existingScenarioGroups: string[];
  cancelHref: string;
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

  // Currency and rate are controlled so the "1 {currency} = __ USD" label
  // can update live as the user types. An empty rate (as opposed to the "1"
  // default) specifically means "AI extraction found a non-USD currency but
  // no stated exchange rate" — never silently guessed — and blocks submit
  // below until the user enters one.
  const [currency, setCurrency] = useState<string>(defaultValues.original_currency ?? "USD");
  const [rate, setRate] = useState(() => {
    if (defaultValues.exchange_rate_to_usd != null) {
      return String(defaultValues.exchange_rate_to_usd);
    }
    // A create-mode AI prefill that found a non-USD currency but no stated
    // rate must start genuinely blank (never a silent "1") — this also
    // covers a plain manual Add Quote, where original_currency is unset and
    // this branch is skipped.
    return defaultValues.original_currency && defaultValues.original_currency !== "USD"
      ? ""
      : "1";
  });
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
  const rateLabel =
    rate.trim() !== "" && !Number.isNaN(rateNumber)
      ? `1 ${currency} = ${rateNumber} USD`
      : null;
  const rateNeedsManualEntry = currency !== "USD" && rate.trim() === "";

  function handleUpload(formData: FormData) {
    setUploadError(null);
    setUploadNotice(null);
    startExtraction(async () => {
      const result = await extractQuoteDetails(
        formData,
        existingScenarioGroups,
        values,
      );
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
      setCurrency(merged.original_currency ?? "USD");
      setRate(
        merged.exchange_rate_to_usd != null
          ? String(merged.exchange_rate_to_usd)
          : merged.original_currency && merged.original_currency !== "USD"
            ? "" // non-USD with no stated rate: leave genuinely blank, never guess
            : "1",
      );
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
            `Enter an exchange rate for ${currency} before saving — one wasn't found in the uploaded document.`,
          );
          return;
        }
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <div key={formKey} className="contents">
      <SectionCard title="Scenario & Terms">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="scenario_group" className={labelClass}>
              Scenario Group
              {highlighted.has("scenario_group") && <UpdatedBadge />}
            </label>
            <input
              id="scenario_group"
              name="scenario_group"
              type="text"
              list="scenario-group-options"
              defaultValue={values.scenario_group ?? ""}
              className={
                highlighted.has("scenario_group")
                  ? `${fieldClass} ${updatedFieldClass}`
                  : fieldClass
              }
            />
            <datalist id="scenario-group-options">
              {existingScenarioGroups.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
            <p className="text-xs text-neutral-muted">
              Comparable quotes must use the exact same scenario group text.
            </p>
          </div>
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
            onChange={(next) => {
              setCurrency(next);
              // Switching back to USD makes any manual-entry warning moot.
              if (next === "USD" && rate.trim() === "") setRate("1");
            }}
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
              onChange={(e) => setRate(e.target.value)}
              className={
                rateNeedsManualEntry
                  ? `${fieldClass} border-[#FBBF24]`
                  : highlighted.has("exchange_rate_to_usd")
                    ? `${fieldClass} ${updatedFieldClass}`
                    : fieldClass
              }
            />
            {rateLabel && <p className="text-xs text-neutral-muted">{rateLabel}</p>}
            {rateNeedsManualEntry && (
              <p className={warningClass}>
                Rate not found in document — enter manually before saving.
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
