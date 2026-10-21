"use client";

import { shipmentFieldId, type ScenarioFields } from "@/lib/landed-cost/editor-draft";
import { divisorFor } from "@/lib/landed-cost/scenario-inputs";
import type { ShipmentMode } from "@/lib/tariff/calculate";
import { FREIGHT_BASIS_LABELS } from "../options";
import { cardClass, fieldClass, sectionTitleClass } from "../styles";
import { Field, TextInput, describedBy } from "./fields";
import type { EditorSectionProps } from "./shipment-section";

const DIVISOR_HINT: Record<ShipmentMode, string> = {
  Air: "Blank uses the air cargo default, 6,000 cm³/kg (courier is often 5,000).",
  Sea: "Blank uses the sea default, 1,000 cm³/kg (1 CBM = 1,000 kg).",
  Road: "Road has no default: blank means chargeable weight is the actual weight.",
};

// 3. Freight: the shipment's typed freight total and how it's split across
// SKUs. The volumetric divisor starts at the mode's default.
export function FreightSection({ draft, disabled, errors, update }: EditorSectionProps) {
  const set = (field: keyof ScenarioFields, value: string) => update((d) => ({ ...d, scenario: { ...d.scenario, [field]: value } }));
  const mode = draft.scenario.shipmentMode as ShipmentMode;
  const id = shipmentFieldId;
  const fallback = divisorFor(mode, null);

  return (
    <section className={cardClass} aria-labelledby="lc-freight-title">
      <h2 id="lc-freight-title" className={`${sectionTitleClass} mb-4`}>
        <span className="text-neutral-muted">3</span> Freight
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field id={id("freightTotalUsd")} label="Freight total" unit="USD" errors={errors} hint="For the whole shipment, e.g. from your forwarder's quote.">
          <TextInput id={id("freightTotalUsd")} value={draft.scenario.freightTotalUsd} onValue={(v) => set("freightTotalUsd", v)} errors={errors} hint numeric disabled={disabled} placeholder="0.00" />
        </Field>
        <Field id={id("freightBasis")} label="Split across SKUs by" errors={errors} hint="Chargeable weight needs each SKU's carton size and weight.">
          <select
            id={id("freightBasis")}
            value={draft.scenario.freightBasis}
            onChange={(e) => set("freightBasis", e.target.value)}
            disabled={disabled}
            aria-describedby={describedBy(id("freightBasis"), errors, true)}
            className={fieldClass}
          >
            {Object.entries(FREIGHT_BASIS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={id("volumetricDivisor")}
          label="Volumetric divisor"
          unit="cm³/kg"
          errors={errors}
          hint={DIVISOR_HINT[mode]}
        >
          <TextInput
            id={id("volumetricDivisor")}
            value={draft.scenario.volumetricDivisor}
            onValue={(v) => set("volumetricDivisor", v)}
            errors={errors}
            hint
            numeric
            disabled={disabled}
            placeholder={fallback ? Number(fallback).toLocaleString("en-US") : "None"}
          />
        </Field>
      </div>
    </section>
  );
}
