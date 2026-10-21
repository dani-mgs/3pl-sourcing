"use client";

import { shipmentFieldId, type EditorDraft, type ScenarioFields } from "@/lib/landed-cost/editor-draft";
import { ENTRY_TYPE_HINT, INCOTERMS, MODE_LABELS } from "../options";
import { cardClass, fieldClass, labelClass, sectionTitleClass } from "../styles";
import { Field, FieldError, TextInput, describedBy, type FieldErrors } from "./fields";

// ISO dates for the date input, and as shown.
export type EntryDateBounds = { min: string; max: string; minText: string; maxText: string };

export type EditorSectionProps = {
  draft: EditorDraft;
  disabled: boolean;
  errors: FieldErrors;
  update: (change: (draft: EditorDraft) => EditorDraft) => void;
};

// 1. Shipment: the workspace and the one origin scenario it costs.
export function ShipmentSection({
  draft,
  disabled,
  errors,
  update,
  countries,
  bounds,
}: EditorSectionProps & { countries: readonly { code: string; name: string }[]; bounds: EntryDateBounds }) {
  const setScenario = (field: keyof ScenarioFields, value: string) =>
    update((d) => ({ ...d, scenario: { ...d.scenario, [field]: value } }));
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  // The scenario is labelled with its country until someone renames it.
  const setOrigin = (code: string) =>
    update((d) => ({
      ...d,
      scenario: {
        ...d.scenario,
        originCountry: code,
        label: d.scenario.label === countryName(d.scenario.originCountry) ? countryName(code) : d.scenario.label,
      },
    }));
  const id = shipmentFieldId;

  return (
    <section className={cardClass} aria-labelledby="lc-shipment-title">
      <h2 id="lc-shipment-title" className={`${sectionTitleClass} mb-4`}>
        <span className="text-neutral-muted">1</span> Shipment
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field id={id("name")} label="Workspace name" errors={errors}>
          <TextInput id={id("name")} value={draft.name} onValue={(v) => update((d) => ({ ...d, name: v }))} errors={errors} disabled={disabled} maxLength={120} />
        </Field>
        <Field id={id("entryDate")} label="Expected entry date" errors={errors} hint={`From ${bounds.minText} to ${bounds.maxText} (UTC).`}>
          <TextInput
            id={id("entryDate")}
            type="date"
            value={draft.entryDate}
            onValue={(v) => update((d) => ({ ...d, entryDate: v }))}
            errors={errors}
            hint
            disabled={disabled}
            min={bounds.min}
            max={bounds.max}
          />
        </Field>
        <Field id={id("originCountry")} label="Country of origin" errors={errors}>
          <select
            id={id("originCountry")}
            value={draft.scenario.originCountry}
            onChange={(e) => setOrigin(e.target.value)}
            disabled={disabled}
            aria-describedby={describedBy(id("originCountry"), errors)}
            className={fieldClass}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("supplierName")} label="Supplier" unit="optional" errors={errors}>
          <TextInput id={id("supplierName")} value={draft.scenario.supplierName} onValue={(v) => setScenario("supplierName", v)} errors={errors} disabled={disabled} maxLength={120} />
        </Field>
        <Field id={id("shipmentMode")} label="Mode" errors={errors}>
          <select id={id("shipmentMode")} value={draft.scenario.shipmentMode} onChange={(e) => setScenario("shipmentMode", e.target.value)} disabled={disabled} className={fieldClass}>
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("incoterm")} label="Incoterm" errors={errors}>
          <select id={id("incoterm")} value={draft.scenario.incoterm} onChange={(e) => setScenario("incoterm", e.target.value)} disabled={disabled} className={fieldClass}>
            {INCOTERMS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="mt-4 flex flex-col gap-2" aria-describedby="lc-entryType-hint">
        <legend className={`${labelClass} mb-2`}>Entry type</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["auto", "Automatic"],
            ["formal", "Formal"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-move-navy">
              <input
                type="radio"
                name="lc-entryType"
                id={value === "auto" ? id("entryType") : undefined}
                value={value}
                checked={draft.scenario.entryType === value}
                onChange={() => setScenario("entryType", value)}
                disabled={disabled}
                className="accent-move-green"
              />
              {label}
            </label>
          ))}
        </div>
        <p id="lc-entryType-hint" className="text-xs text-neutral-muted">
          {ENTRY_TYPE_HINT}
        </p>
        <FieldError id={id("entryType")} errors={errors} />
      </fieldset>
    </section>
  );
}
