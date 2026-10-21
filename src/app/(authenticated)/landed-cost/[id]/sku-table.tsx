"use client";

import { Fragment, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MAX_EDITOR_SKUS, newSkuRow, skuFieldId, type SkuInput, type SkuRow } from "@/lib/landed-cost/editor-draft";
import { liveMeasures, liveShipment } from "@/lib/landed-cost/live-measures";
import { dutyQuantityLabel } from "@/lib/landed-cost/result-view";
import type { DutyUnit } from "@/lib/landed-cost/server-compute";
import type { ShipmentMode } from "@/lib/tariff/calculate";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import type { LookupLine } from "@/lib/tariff/hts-lookup";
import { HtsLookupDialog, type LookupRelease } from "../../tariff-calculator/hts-lookup/hts-lookup-dialog";
import { cardClass, hintClass, linkButtonClass, sectionTitleClass } from "../styles";
import { FieldError, TextInput } from "./fields";
import type { EditorSectionProps } from "./shipment-section";

const cellInput =
  "w-full min-w-0 rounded-lg border border-neutral-border bg-white px-2 py-1.5 text-sm text-move-navy focus:border-move-green focus:ring-2 focus:ring-move-green focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted aria-invalid:border-danger";

const COLUMNS: { field: SkuInput; label: string; unit?: string; numeric?: boolean; width: string }[] = [
  { field: "skuCode", label: "SKU", width: "w-28" },
  { field: "description", label: "Description", width: "w-44" },
  { field: "htsCode", label: "HTS code", width: "w-36" },
  { field: "quantity", label: "Qty", unit: "pcs", numeric: true, width: "w-24" },
  { field: "fobUnitPriceUsd", label: "FOB / unit", unit: "USD", numeric: true, width: "w-24" },
  { field: "pcsPerCarton", label: "Pcs / ctn", numeric: true, width: "w-20" },
  { field: "cartonLengthCm", label: "L", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonWidthCm", label: "W", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonHeightCm", label: "H", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonGrossKg", label: "Ctn wt", unit: "kg", numeric: true, width: "w-20" },
];

// 2. SKUs: one row per SKU line, with this scenario's FOB price and carton.
// Cartons, CBM and weights are shown live (display only). The duty quantity
// appears only where the last result asked for it, in the rate's unit; it's
// never filled from the carton weight.
export function SkuTable({
  draft,
  disabled,
  errors,
  update,
  dutyQuantityUnits,
  htsRelease,
  newRef,
}: EditorSectionProps & {
  dutyQuantityUnits: Record<string, DutyUnit>;
  htsRelease: LookupRelease | null;
  newRef: () => string;
}) {
  const [lookupFor, setLookupFor] = useState<string | null>(null);
  const lookupButton = useRef<HTMLElement | null>(null);
  const mode = draft.scenario.shipmentMode as ShipmentMode;
  const divisor = draft.scenario.volumetricDivisor;

  const setRow = (ref: string, change: Partial<SkuRow>) =>
    update((d) => ({ ...d, skus: d.skus.map((s) => (s.ref === ref ? { ...s, ...change } : s)) }));
  const addRow = () => {
    const ref = newRef();
    update((d) => ({ ...d, skus: [...d.skus, newSkuRow(ref)] }));
    // Focus the new row's first cell once it's rendered.
    requestAnimationFrame(() => document.getElementById(skuFieldId(ref, "skuCode"))?.focus());
  };
  const removeRow = (ref: string) => update((d) => ({ ...d, skus: d.skus.filter((s) => s.ref !== ref) }));
  const pick = (line: LookupLine) => {
    if (lookupFor) setRow(lookupFor, { htsCode: formatHtsCode(line.hts_code) });
  };
  const totals = liveShipment(draft.skus, mode, divisor);

  return (
    <section className={cardClass} aria-labelledby="lc-skus-title">
      <HtsLookupDialog
        open={lookupFor != null}
        onOpenChange={(open) => !open && setLookupFor(null)}
        release={htsRelease}
        onPick={pick}
        finalFocus={lookupButton}
      />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="lc-skus-title" className={sectionTitleClass}>
          <span className="text-neutral-muted">2</span> SKUs{" "}
          <span className="text-sm font-normal text-neutral-muted">
            {draft.skus.length} {draft.skus.length === 1 ? "row" : "rows"}
          </span>
        </h2>
        <button type="button" onClick={addRow} disabled={disabled || draft.skus.length >= MAX_EDITOR_SKUS} className={linkButtonClass}>
          <Plus aria-hidden="true" className="mr-1 inline size-4" />
          Add SKU
        </button>
      </div>

      {draft.skus.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-muted">No SKUs yet. Add one: its code, HTS code, quantity and FOB price.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                {COLUMNS.map((c) => (
                  <th key={c.field} scope="col" className={`px-1.5 py-2 font-medium ${c.width} ${c.numeric ? "text-right" : ""}`}>
                    {c.label}
                    {c.unit && <span className="block text-[10px] normal-case">{c.unit}</span>}
                  </th>
                ))}
                <th scope="col" className="w-10 px-1.5 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.skus.map((row, index) => {
                const name = row.skuCode.trim() || `Row ${index + 1}`;
                const measures = liveMeasures(row, mode, divisor);
                const unit = dutyQuantityUnits[row.ref] ?? (row.dutyQuantityUnit ? { token: row.dutyQuantityUnit, label: row.dutyQuantityUnit } : null);
                const rowErrors = COLUMNS.map((c) => skuFieldId(row.ref, c.field)).filter((id) => errors[id]);
                return (
                  <Fragment key={row.ref}>
                    <tr className="align-top">
                      {COLUMNS.map((c) => {
                        const id = skuFieldId(row.ref, c.field);
                        return (
                          <td key={c.field} className="px-1.5 pt-2">
                            <label htmlFor={id} className="sr-only">
                              {name}: {c.label}
                              {c.unit ? ` (${c.unit})` : ""}
                            </label>
                            <TextInput
                              id={id}
                              value={row[c.field]}
                              onValue={(v) => setRow(row.ref, { [c.field]: v })}
                              errors={errors}
                              numeric={c.numeric}
                              disabled={disabled}
                              className={cellInput}
                            />
                            {c.field === "htsCode" && (
                              <button
                                type="button"
                                className={`${linkButtonClass} mt-1 text-xs`}
                                disabled={disabled}
                                onClick={(e) => {
                                  lookupButton.current = e.currentTarget;
                                  setLookupFor(row.ref);
                                }}
                              >
                                Look up<span className="sr-only"> the HTS code for {name}</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-1.5 pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.ref)}
                          disabled={disabled}
                          className="rounded-md p-1.5 text-neutral-muted hover:bg-neutral-bg hover:text-danger focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none disabled:cursor-not-allowed"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          <span className="sr-only">Remove {name}</span>
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-neutral-border">
                      <td colSpan={COLUMNS.length + 1} className="px-1.5 pt-1 pb-3">
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                          <p className={`${hintClass} tabular-nums`} aria-live="polite">
                            {measures ? (
                              <>
                                {measures.cartons} cartons
                                {measures.partial && (
                                  <span className="font-medium text-[#92400E]"> · partial: {measures.partial}</span>
                                )}{" "}
                                · {measures.cbm} m³ · {measures.actualKg} kg actual
                                {measures.volumetricKg && <> · {measures.volumetricKg} kg volumetric</>} · {measures.chargeableKg} kg chargeable (
                                {measures.chargeableBasis})
                              </>
                            ) : (
                              "Cartons and weights show once the quantity and carton are entered."
                            )}
                          </p>
                          {unit && (
                            <div className="flex items-center gap-2">
                              <label htmlFor={skuFieldId(row.ref, "dutyQuantity")} className="text-xs font-medium text-move-navy">
                                {name}: {dutyQuantityLabel(unit)}
                              </label>
                              <TextInput
                                id={skuFieldId(row.ref, "dutyQuantity")}
                                value={row.dutyQuantity}
                                onValue={(v) => setRow(row.ref, { dutyQuantity: v, dutyQuantityUnit: unit.token })}
                                errors={errors}
                                numeric
                                disabled={disabled}
                                className={`${cellInput} w-28`}
                              />
                            </div>
                          )}
                        </div>
                        {[...rowErrors, skuFieldId(row.ref, "dutyQuantity")].map((id) => (
                          <FieldError key={id} id={id} errors={errors} />
                        ))}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className={`${hintClass} mt-3 tabular-nums`}>
            {totals ? (
              <>
                Total: {totals.cartons} cartons · {totals.cbm} m³ · {totals.actualKg} kg actual
                {totals.volumetricKg && <> · {totals.volumetricKg} kg volumetric</>} · {totals.chargeableKg} kg chargeable
              </>
            ) : (
              "Shipment totals show once every row's quantity and carton are entered."
            )}{" "}
            Shown as you type; the result uses the last save.
          </p>
        </div>
      )}
    </section>
  );
}
