"use client";

import { Fragment, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  EMPTY_ITEM,
  MAX_EDITOR_SKUS,
  addSkuRow,
  itemFieldId,
  removeSkuRow,
  skuFieldId,
  type ItemInput,
  type ScenarioDraft,
  type SkuLineInput,
  type SkuRow,
} from "@/lib/landed-cost/editor-draft";
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

type Column<F> = { field: F; label: string; unit?: string; numeric?: boolean; width: string };

const SKU_COLUMNS: Column<SkuLineInput>[] = [
  { field: "skuCode", label: "SKU", width: "w-28" },
  { field: "description", label: "Description", width: "w-44" },
  { field: "htsCode", label: "HTS code", width: "w-36" },
  { field: "quantity", label: "Qty", unit: "pcs", numeric: true, width: "w-24" },
];
const ITEM_COLUMNS: Column<ItemInput>[] = [
  { field: "fobUnitPriceUsd", label: "FOB / unit", unit: "USD", numeric: true, width: "w-24" },
  { field: "pcsPerCarton", label: "Pcs / ctn", numeric: true, width: "w-20" },
  { field: "cartonLengthCm", label: "L", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonWidthCm", label: "W", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonHeightCm", label: "H", unit: "cm", numeric: true, width: "w-20" },
  { field: "cartonGrossKg", label: "Ctn wt", unit: "kg", numeric: true, width: "w-20" },
];

// The SKU table in three forms:
//   combined  one origin: the SKU lines with that origin's FOB and carton (as Phase 2c-2)
//   shared    several origins: the SKU lines only, the same for every origin
//   items     one origin's FOB price and carton per SKU line (in its tab)
// Cartons, CBM and weights are shown live (display only). The duty quantity
// appears only where the last result asked for it, in the rate's unit; it's
// never filled from the carton weight.
export function SkuTable({
  draft,
  disabled,
  errors,
  update,
  mode,
  scenario,
  dutyQuantityUnits,
  htsRelease,
  newRef,
}: EditorSectionProps & {
  mode: "combined" | "shared" | "items";
  scenario: ScenarioDraft | null;
  dutyQuantityUnits: Record<string, DutyUnit>;
  htsRelease: LookupRelease | null;
  newRef: () => string;
}) {
  const [lookupFor, setLookupFor] = useState<string | null>(null);
  const lookupButton = useRef<HTMLElement | null>(null);
  const showSku = mode !== "items";
  const showItems = mode !== "shared" && scenario != null;
  const shipmentMode = (scenario?.shipmentMode ?? "Sea") as ShipmentMode;
  const divisor = scenario?.volumetricDivisor ?? "";

  const setRow = (ref: string, change: Partial<SkuRow>) =>
    update((d) => ({ ...d, skus: d.skus.map((s) => (s.ref === ref ? { ...s, ...change } : s)) }));
  const setItem = (skuRef: string, field: ItemInput, value: string) =>
    update((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) =>
        s.ref === scenario?.ref ? { ...s, items: { ...s.items, [skuRef]: { ...(s.items[skuRef] ?? EMPTY_ITEM), [field]: value } } } : s,
      ),
    }));
  const addRow = () => {
    const ref = newRef();
    update((d) => addSkuRow(d, ref));
    // Focus the new row's first cell once it's rendered.
    requestAnimationFrame(() => document.getElementById(skuFieldId(ref, "skuCode"))?.focus());
  };
  const pick = (line: LookupLine) => {
    if (lookupFor) setRow(lookupFor, { htsCode: formatHtsCode(line.hts_code) });
  };
  const itemOf = (row: SkuRow) => scenario?.items[row.ref] ?? EMPTY_ITEM;
  const totals = showItems ? liveShipment(draft.skus.map((r) => ({ quantity: r.quantity, item: itemOf(r) })), shipmentMode, divisor) : null;
  const columnCount = (showSku ? SKU_COLUMNS.length : 1) + (showItems ? ITEM_COLUMNS.length : 0) + (showSku ? 1 : 0);
  const title =
    mode === "items" ? (
      <>
        <span className="text-neutral-muted">B</span> FOB price and packing
      </>
    ) : (
      <>
        <span className="text-neutral-muted">{mode === "shared" ? "" : "2"}</span> SKUs{" "}
        <span className="text-sm font-normal text-neutral-muted">
          {draft.skus.length} {draft.skus.length === 1 ? "row" : "rows"}
          {mode === "shared" && " · the same for every origin"}
        </span>
      </>
    );

  return (
    <section className={cardClass} aria-label={mode === "items" ? `FOB price and packing${scenario ? `, ${scenario.label}` : ""}` : "SKUs"}>
      {showSku && (
        <HtsLookupDialog open={lookupFor != null} onOpenChange={(open) => !open && setLookupFor(null)} release={htsRelease} onPick={pick} finalFocus={lookupButton} />
      )}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className={sectionTitleClass}>{title}</h2>
        {showSku && (
          <button type="button" onClick={addRow} disabled={disabled || draft.skus.length >= MAX_EDITOR_SKUS} className={linkButtonClass}>
            <Plus aria-hidden="true" className="mr-1 inline size-4" />
            Add SKU
          </button>
        )}
      </div>

      {draft.skus.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-muted">
          {mode === "items" ? "Add SKUs above first." : "No SKUs yet. Add one: its code, HTS code, quantity and FOB price."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-left text-sm text-move-navy ${mode === "combined" ? "min-w-[1080px]" : ""}`}>
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                {showSku ? (
                  SKU_COLUMNS.map((c) => (
                    <th key={c.field} scope="col" className={`px-1.5 py-2 font-medium ${c.width} ${c.numeric ? "text-right" : ""}`}>
                      {c.label}
                      {c.unit && <span className="block text-[10px] normal-case">{c.unit}</span>}
                    </th>
                  ))
                ) : (
                  <th scope="col" className="w-28 px-1.5 py-2 font-medium">
                    SKU
                  </th>
                )}
                {showItems &&
                  ITEM_COLUMNS.map((c) => (
                    <th key={c.field} scope="col" className={`px-1.5 py-2 text-right font-medium ${c.width}`}>
                      {c.label}
                      {c.unit && <span className="block text-[10px] normal-case">{c.unit}</span>}
                    </th>
                  ))}
                {showSku && (
                  <th scope="col" className="w-10 px-1.5 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {draft.skus.map((row, index) => {
                const name = row.skuCode.trim() || `Row ${index + 1}`;
                const item = itemOf(row);
                const measures = showItems ? liveMeasures({ quantity: row.quantity, item }, shipmentMode, divisor) : null;
                const unit = dutyQuantityUnits[row.ref] ?? (row.dutyQuantityUnit ? { token: row.dutyQuantityUnit, label: row.dutyQuantityUnit } : null);
                const ids = [
                  ...(showSku ? SKU_COLUMNS.map((c) => skuFieldId(row.ref, c.field)) : []),
                  ...(showItems ? ITEM_COLUMNS.map((c) => itemFieldId(scenario!.ref, row.ref, c.field)) : []),
                  ...(showSku ? [skuFieldId(row.ref, "dutyQuantity")] : []),
                ];
                return (
                  <Fragment key={row.ref}>
                    <tr className="align-top">
                      {showSku ? (
                        SKU_COLUMNS.map((c) => {
                          const id = skuFieldId(row.ref, c.field);
                          return (
                            <td key={c.field} className="px-1.5 pt-2">
                              <label htmlFor={id} className="sr-only">
                                {name}: {c.label}
                                {c.unit ? ` (${c.unit})` : ""}
                              </label>
                              <TextInput id={id} value={row[c.field]} onValue={(v) => setRow(row.ref, { [c.field]: v })} errors={errors} numeric={c.numeric} disabled={disabled} className={cellInput} />
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
                        })
                      ) : (
                        <th scope="row" className="px-1.5 pt-3.5 font-medium">
                          {name}
                          <span className="block text-xs font-normal text-neutral-muted tabular-nums">{row.quantity || "—"} pcs</span>
                        </th>
                      )}
                      {showItems &&
                        ITEM_COLUMNS.map((c) => {
                          const id = itemFieldId(scenario!.ref, row.ref, c.field);
                          return (
                            <td key={c.field} className="px-1.5 pt-2">
                              <label htmlFor={id} className="sr-only">
                                {name}: {c.label}
                                {c.unit ? ` (${c.unit})` : ""}
                                {mode === "items" ? `, ${scenario!.label}` : ""}
                              </label>
                              <TextInput id={id} value={item[c.field]} onValue={(v) => setItem(row.ref, c.field, v)} errors={errors} numeric disabled={disabled} className={cellInput} />
                            </td>
                          );
                        })}
                      {showSku && (
                        <td className="px-1.5 pt-2 text-center">
                          <button
                            type="button"
                            onClick={() => update((d) => removeSkuRow(d, row.ref))}
                            disabled={disabled}
                            className="rounded-md p-1.5 text-neutral-muted hover:bg-neutral-bg hover:text-danger focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none disabled:cursor-not-allowed"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            <span className="sr-only">Remove {name}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                    <tr className="border-b border-neutral-border">
                      <td colSpan={columnCount} className="px-1.5 pt-1 pb-3">
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                          {showItems && (
                            <p className={`${hintClass} tabular-nums`} aria-live="polite">
                              {measures ? (
                                <>
                                  {measures.cartons} cartons
                                  {measures.partial && <span className="font-medium text-[#92400E]"> · partial: {measures.partial}</span>} ·{" "}
                                  {measures.cbm} m³ · {measures.actualKg} kg actual
                                  {measures.volumetricKg && <> · {measures.volumetricKg} kg volumetric</>} · {measures.chargeableKg} kg chargeable (
                                  {measures.chargeableBasis})
                                </>
                              ) : (
                                "Cartons and weights show once the quantity and carton are entered."
                              )}
                            </p>
                          )}
                          {showSku && unit && (
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
                        {ids.map((id) => (
                          <FieldError key={id} id={id} errors={errors} />
                        ))}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {showItems && (
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
          )}
        </div>
      )}
    </section>
  );
}
