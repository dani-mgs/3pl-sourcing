"use client";

import {
  scenarioFieldId,
  workspaceFieldId,
  type EditorDraft,
  type ScenarioDraft,
  type ScenarioInput,
} from "@/lib/landed-cost/editor-draft";
import { labelError } from "@/lib/landed-cost/origin-draft";
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

export type Countries = readonly { code: string; name: string }[];

// Changes one origin in the draft.
export function updateScenario(update: EditorSectionProps["update"], ref: string, change: Partial<ScenarioDraft>) {
  update((d) => ({ ...d, scenarios: d.scenarios.map((s) => (s.ref === ref ? { ...s, ...change } : s)) }));
}

// The workspace's own fields: shared by every origin.
export function WorkspaceFields({
  draft,
  disabled,
  errors,
  update,
  bounds,
}: EditorSectionProps & { bounds: EntryDateBounds }) {
  return (
    <>
      <Field id={workspaceFieldId("name")} label="Workspace name" errors={errors}>
        <TextInput id={workspaceFieldId("name")} value={draft.name} onValue={(v) => update((d) => ({ ...d, name: v }))} errors={errors} disabled={disabled} maxLength={120} />
      </Field>
      <Field id={workspaceFieldId("entryDate")} label="Expected entry date" errors={errors} hint={`From ${bounds.minText} to ${bounds.maxText} (UTC).`}>
        <TextInput
          id={workspaceFieldId("entryDate")}
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
    </>
  );
}

// 1. Shipment: one origin's fields. With one origin (`workspaceFields`) the
// workspace's name and entry date sit here too, and the label follows the
// country silently; with several, each origin has an editable label.
export function ShipmentSection({
  scenario,
  workspaceFields,
  countries,
  bounds,
  ...props
}: EditorSectionProps & { scenario: ScenarioDraft; workspaceFields: boolean; countries: Countries; bounds: EntryDateBounds }) {
  const { draft, disabled, errors, update } = props;
  const ref = scenario.ref;
  const id = (field: ScenarioInput) => scenarioFieldId(ref, field);
  const set = (field: ScenarioInput, value: string) => updateScenario(update, ref, { [field]: value });
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  // The label follows the country until someone renames it.
  const setOrigin = (code: string) =>
    updateScenario(update, ref, {
      originCountry: code,
      label: scenario.label === countryName(scenario.originCountry) ? countryName(code) : scenario.label,
    });
  const labelProblem = workspaceFields ? null : labelError(draft, ref);
  // A label problem shows at once, before any save.
  const labelErrors = labelProblem && !errors[id("label")] ? { ...errors, [id("label")]: labelProblem } : errors;

  return (
    <section className={cardClass} aria-labelledby={`${id("label")}-title`}>
      <h2 id={`${id("label")}-title`} className={`${sectionTitleClass} mb-4`}>
        <span className="text-neutral-muted">{workspaceFields ? "1" : "A"}</span> Shipment
        {!workspaceFields && <span className="text-sm font-normal text-neutral-muted"> · {scenario.label || "this origin"}</span>}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaceFields && <WorkspaceFields {...props} bounds={bounds} />}
        {!workspaceFields && (
          <Field id={id("label")} label="Origin label" errors={labelErrors} hint="Unique in this workspace, e.g. the country and supplier.">
            <TextInput
              id={id("label")}
              value={scenario.label}
              onValue={(v) => set("label", v)}
              errors={labelErrors}
              hint
              disabled={disabled}
              maxLength={60}
            />
          </Field>
        )}
        <Field id={id("originCountry")} label="Country of origin" errors={errors}>
          <select
            id={id("originCountry")}
            value={scenario.originCountry}
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
          <TextInput id={id("supplierName")} value={scenario.supplierName} onValue={(v) => set("supplierName", v)} errors={errors} disabled={disabled} maxLength={120} />
        </Field>
        <Field id={id("shipmentMode")} label="Mode" errors={errors}>
          <select id={id("shipmentMode")} value={scenario.shipmentMode} onChange={(e) => set("shipmentMode", e.target.value)} disabled={disabled} className={fieldClass}>
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("incoterm")} label="Incoterm" errors={errors}>
          <select id={id("incoterm")} value={scenario.incoterm} onChange={(e) => set("incoterm", e.target.value)} disabled={disabled} className={fieldClass}>
            {INCOTERMS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="mt-4 flex flex-col gap-2" aria-describedby={`${id("entryType")}-hint`}>
        <legend className={`${labelClass} mb-2`}>Entry type</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["auto", "Automatic"],
            ["formal", "Formal"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-move-navy">
              <input
                type="radio"
                name={id("entryType")}
                id={value === "auto" ? id("entryType") : undefined}
                value={value}
                checked={scenario.entryType === value}
                onChange={() => set("entryType", value)}
                disabled={disabled}
                className="accent-move-green"
              />
              {label}
            </label>
          ))}
        </div>
        <p id={`${id("entryType")}-hint`} className="text-xs text-neutral-muted">
          {ENTRY_TYPE_HINT}
        </p>
        <FieldError id={id("entryType")} errors={errors} />
      </fieldset>
    </section>
  );
}
