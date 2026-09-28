"use client";

import { startTransition, useActionState, useState } from "react";
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
import { InputField, SelectField, TextAreaField, fieldClass, labelClass } from "../../../../form-fields";
import { createQuote } from "./new/actions";
import { updateQuote } from "./[quoteId]/edit/actions";

export type QuoteFormDefaults = Partial<QuoteFields>;

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

  // Mode/type are controlled so the type list can follow the mode, same
  // pattern as the project intake form.
  const [mode, setMode] = useState(defaultValues.shipment_mode ?? "");
  const [type, setType] = useState(defaultValues.shipment_type ?? "");

  // Currency and rate are controlled so the "1 {currency} = __ USD" label
  // can update live as the user types.
  const [currency, setCurrency] = useState<string>(defaultValues.original_currency ?? "USD");
  const [rate, setRate] = useState(
    defaultValues.exchange_rate_to_usd != null ? String(defaultValues.exchange_rate_to_usd) : "1",
  );

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

  return (
    <form
      // Submitted manually rather than via `action` so React doesn't reset
      // the uncontrolled fields when the server returns an error.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <SectionCard title="Scenario & Terms">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="scenario_group" className={labelClass}>
              Scenario Group
            </label>
            <input
              id="scenario_group"
              name="scenario_group"
              type="text"
              list="scenario-group-options"
              defaultValue={defaultValues.scenario_group ?? ""}
              className={fieldClass}
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
            onChange={setType}
            disabled={!mode}
            placeholder={mode ? "Select…" : "Choose a mode first"}
          />
          <SelectField
            name="incoterm"
            label="Incoterm"
            options={INCOTERMS}
            defaultValue={defaultValues.incoterm}
          />
          <InputField name="origin" label="Origin" defaultValue={defaultValues.origin} />
          <InputField name="destination" label="Destination" defaultValue={defaultValues.destination} />
        </div>
      </SectionCard>

      <SectionCard title="Weight & Value">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="actual_weight_kg" label="Actual Weight (kg)" type="number" step="0.001" defaultValue={defaultValues.actual_weight_kg} />
          <InputField name="chargeable_weight_kg" label="Chargeable Weight (kg)" type="number" step="0.001" defaultValue={defaultValues.chargeable_weight_kg} />
          <InputField name="cbm" label="CBM" type="number" step="0.000001" defaultValue={defaultValues.cbm} />
          <InputField name="cost_of_goods_usd" label="Cost of Goods (USD)" type="number" step="0.01" defaultValue={defaultValues.cost_of_goods_usd} />
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
            onChange={setCurrency}
          />
          <InputField name="original_amount" label="Amount" type="number" step="0.01" defaultValue={defaultValues.original_amount} />
          <div className="flex flex-col gap-2">
            <label htmlFor="exchange_rate_to_usd" className={labelClass}>
              Exchange Rate to USD
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
              className={fieldClass}
            />
            {rateLabel && <p className="text-xs text-neutral-muted">{rateLabel}</p>}
          </div>
          <InputField name="duties_taxes_usd" label="Duties & Taxes (USD)" type="number" step="0.01" defaultValue={defaultValues.duties_taxes_usd} />
          <InputField name="other_charges_usd" label="Other Charges (USD)" type="number" step="0.01" defaultValue={defaultValues.other_charges_usd} />
          <TextAreaField name="other_charges_description" label="Other Charges Description" defaultValue={defaultValues.other_charges_description} />
        </div>
      </SectionCard>

      <SectionCard title="Timing">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField name="lead_time_min_days" label="Lead Time Min (days)" type="number" step="0.1" defaultValue={defaultValues.lead_time_min_days} />
          <InputField name="lead_time_max_days" label="Lead Time Max (days)" type="number" step="0.1" defaultValue={defaultValues.lead_time_max_days} />
          <InputField name="quote_date" label="Quote Date" type="date" defaultValue={defaultValues.quote_date} />
          <InputField name="rate_valid_until" label="Rate Valid Until" type="date" defaultValue={defaultValues.rate_valid_until} />
          <InputField name="quote_reference" label="Quote Reference" defaultValue={defaultValues.quote_reference} />
        </div>
      </SectionCard>

      <SectionCard title="Assessment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="quote_completeness"
            label="Quote Completeness"
            options={QUOTE_COMPLETENESS_OPTIONS}
            defaultValue={defaultValues.quote_completeness}
          />
          <SelectField
            name="overall_assessment"
            label="Overall Assessment"
            options={OVERALL_ASSESSMENT_OPTIONS}
            defaultValue={defaultValues.overall_assessment}
          />
          <SelectField
            name="client_decision"
            label="Client Decision"
            options={CLIENT_DECISION_OPTIONS}
            defaultValue={defaultValues.client_decision}
          />
          <TextAreaField name="key_strength" label="Key Strength" defaultValue={defaultValues.key_strength} />
          <TextAreaField name="key_weakness_risk" label="Key Weakness / Risk" defaultValue={defaultValues.key_weakness_risk} />
          <TextAreaField name="important_assumption" label="Important Assumption" defaultValue={defaultValues.important_assumption} />
          <TextAreaField name="notes" label="Notes" defaultValue={defaultValues.notes} />
        </div>
      </SectionCard>

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
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
  );
}
