"use client";

import { cat } from "@/lib/forwarder-audit/calc-semantics";
import type { AuditResult } from "@/lib/forwarder-audit/engine";
import { QUOTATION_FIELDS, SHIPMENT_FIELDS } from "@/lib/forwarder-audit/field-defs";
import { SERVICE_MARKS, YES_NO } from "@/lib/forwarder-audit/lists";
import { textMoney, textPercent, textQty3 } from "@/lib/forwarder-audit/text-format";
import type { AuditInputs } from "@/lib/forwarder-audit/types";
import { cardClass, hintClass, sectionTitleClass } from "../styles";
import { FieldControl, NumberInput, SelectInput, type OnBad } from "./form-controls";

// Sections 1 to 3 of the Audit sheet as a form. `onChange` receives one
// section's change at a time; the editor applies it to its draft.

type Props = { inputs: AuditInputs; result: AuditResult; onBad: OnBad; set: (updater: (draft: AuditInputs) => AuditInputs) => void };

export function ShipmentSection({ inputs, onBad, set }: Props) {
  return (
    <section className={cardClass} aria-labelledby="fa-s1-title">
      <h2 id="fa-s1-title" className={sectionTitleClass}>
        1 Shipment information
      </h2>
      <p className={`${hintClass} mt-1 mb-4`}>From the commercial invoice, packing list and the client&apos;s request.</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {SHIPMENT_FIELDS.map((def) => (
          <FieldControl
            key={def.key}
            def={def}
            value={inputs.shipment[def.key]}
            onBad={onBad}
            onChange={(key, value) => set((d) => ({ ...d, shipment: { ...d.shipment, [key]: value } }))}
          />
        ))}
      </div>
    </section>
  );
}

const cellClass = "px-3 py-2 align-top";

export function QuotationSection({ inputs, result, onBad, set }: Props) {
  const rows = [
    { label: "Pieces", row: result.cargo.pieces, field: "pieces" as const, accept: null },
    { label: "Packages (cartons or pallets)", row: result.cargo.packages, field: "packages" as const, accept: null },
    { label: "Gross weight (kg)", row: result.cargo.grossWeight, field: "grossWeightKg" as const, accept: "acceptWeightDifference" as const },
    { label: "Volume (CBM)", row: result.cargo.volume, field: "volumeCbm" as const, accept: "acceptVolumeDifference" as const },
  ];
  return (
    <section className={cardClass} aria-labelledby="fa-s2-title">
      <h2 id="fa-s2-title" className={sectionTitleClass}>
        2 Quotation information
      </h2>
      <p className={`${hintClass} mt-1 mb-4`}>The quotation being audited.</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {QUOTATION_FIELDS.map((def) => (
          <FieldControl
            key={def.key}
            def={def}
            value={inputs.quotation[def.key]}
            onBad={onBad}
            onChange={(key, value) => set((d) => ({ ...d, quotation: { ...d.quotation, [key]: value } }))}
          />
        ))}
      </div>

      <h3 className="mt-6 mb-1 text-sm font-semibold text-move-navy">Cargo basis</h3>
      <p className={`${hintClass} mb-2`}>Enter the cargo figures only if the quotation states them (blank = not stated).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-move-navy">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className={cellClass}>Item</th>
              <th scope="col" className={cellClass}>CI/PL (auto)</th>
              <th scope="col" className={cellClass}>Quoted</th>
              <th scope="col" className={cellClass}>Difference</th>
              <th scope="col" className={cellClass}>Diff %</th>
              <th scope="col" className={cellClass}>Accept diff.?</th>
              <th scope="col" className={cellClass}>Check (auto)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, row, field, accept }) => (
              <tr key={field} className="border-b border-neutral-border last:border-0">
                <th scope="row" className={`${cellClass} font-medium`}>{label}</th>
                <td className={cellClass}>{cat(row.ciPl)}</td>
                <td className={cellClass}>
                  <NumberInput
                    id={`fa-quoted-${field}`}
                    label={`Quoted ${label}`}
                    value={inputs.quotedCargo[field]}
                    onBad={onBad}
                    onChange={(v) => set((d) => ({ ...d, quotedCargo: { ...d.quotedCargo, [field]: v } }))}
                  />
                </td>
                <td className={cellClass}>{row.difference === "" ? "" : textQty3(row.difference)}</td>
                <td className={cellClass}>{row.differencePercent === "" ? "" : textPercent(row.differencePercent)}</td>
                <td className={cellClass}>
                  {accept ? (
                    <SelectInput
                      id={`fa-${accept}`}
                      label={`Accept ${label} difference`}
                      value={inputs.quotedCargo[accept]}
                      options={YES_NO}
                      onChange={(v) => set((d) => ({ ...d, quotedCargo: { ...d.quotedCargo, [accept]: v } }))}
                    />
                  ) : (
                    <span className="text-neutral-muted">Must match</span>
                  )}
                </td>
                <td className={`${cellClass} ${row.check.startsWith("ERROR") ? "font-medium text-danger" : ""}`}>{row.check}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${hintClass} mt-3`}>
        Revenue tonnes (auto): {cat(result.measures.revenueTonnes)} · Chargeable weight kg (auto): {cat(result.measures.chargeableKg)}
        {inputs.quotation.mode.toUpperCase() === "AIR" ? ` · Divisor used: ${result.measures.divisorUsed}` : ""}
      </p>
    </section>
  );
}

export function ServicesSection({ inputs, result, set }: Props) {
  return (
    <section className={cardClass} aria-labelledby="fa-s3-title">
      <h2 id="fa-s3-title" className={sectionTitleClass}>
        3 Requested services &amp; coverage
      </h2>
      <p className={`${hintClass} mt-1 mb-4`}>Coverage fills in from the charge lines; only mark a service that has no lines.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-move-navy">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className={cellClass}>Service</th>
              <th scope="col" className={cellClass}>Requested by client?</th>
              <th scope="col" className={cellClass}>Found in quotation (auto)</th>
              <th scope="col" className={cellClass}>Mark if no lines</th>
              <th scope="col" className={cellClass}>Coverage (auto)</th>
              <th scope="col" className={`${cellClass} text-right`}>Firm amount (auto)</th>
              <th scope="col" className={cellClass}>Normally paid by (auto)</th>
            </tr>
          </thead>
          <tbody>
            {result.coverage.map((c, s) => (
              <tr key={c.service} className="border-b border-neutral-border last:border-0">
                <th scope="row" className={`${cellClass} font-medium`}>{c.service}</th>
                <td className={cellClass}>
                  <SelectInput
                    id={`fa-requested-${s}`}
                    label={`${c.service} requested`}
                    value={inputs.services[s].requested}
                    options={YES_NO}
                    onChange={(v) => set((d) => ({ ...d, services: d.services.map((x, k) => (k === s ? { ...x, requested: v } : x)) }))}
                  />
                </td>
                <td className={cellClass}>{c.found}</td>
                <td className={cellClass}>
                  <SelectInput
                    id={`fa-mark-${s}`}
                    label={`${c.service} mark`}
                    value={inputs.services[s].mark}
                    options={SERVICE_MARKS}
                    onChange={(v) => set((d) => ({ ...d, services: d.services.map((x, k) => (k === s ? { ...x, mark: v } : x)) }))}
                  />
                </td>
                <td className={`${cellClass} ${c.requested.toUpperCase() === "YES" && ["Not addressed", "Excluded", "Unpriced"].includes(c.coverage) ? "font-medium text-danger" : ""}`}>{c.coverage}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{textMoney(c.firmAmount)}</td>
                <td className={cellClass}>{c.payer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
