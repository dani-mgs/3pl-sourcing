"use client";

import { cat, isErr } from "@/lib/forwarder-audit/calc-semantics";
import { BASES, CATEGORY_NAMES, FLAG_NAMES, LINE_STATUSES, MAX_LINES } from "@/lib/forwarder-audit/lists";
import type { ChargeLineInputs, LineResult } from "@/lib/forwarder-audit/types";
import { cardClass, fieldClass, hintClass, linkButtonClass, secondaryButtonClass, sectionTitleClass } from "../styles";
import { NumberInput, SelectInput, type OnBad } from "./form-controls";

// Section 4: one row per quoted charge (up to 50), with the workbook's
// calculated columns beside each (quantity used, total, check, group).

const cell = "px-1.5 py-1 align-top";
const small = `${fieldClass} min-w-24`;

export function ChargeLines({
  lines,
  keys,
  results,
  onChange,
  onAdd,
  onRemove,
  onBad,
}: {
  lines: ChargeLineInputs[];
  keys: number[];
  results: LineResult[];
  onChange: (index: number, patch: Partial<ChargeLineInputs>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onBad: OnBad;
}) {
  return (
    <section className={cardClass} aria-labelledby="fa-lines-title">
      <h2 id="fa-lines-title" className={sectionTitleClass}>
        4 Charge breakdown
      </h2>
      <p className={`${hintClass} mt-1 mb-4`}>
        One row per quoted charge. Required: Charge, Category, Basis, Rate (unless at cost/TBC), Status. Leave Currency blank for the quotation
        currency. Local tax is a percentage. Removing a row renumbers the lines below it.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px] text-left text-sm text-move-navy">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              {["#", "Charge (as quoted)", "Category", "Basis", "Rate", "Currency", "Status", "Qty / base override", "Minimum charge", "Local tax %", "Forwarder's line total", "Agreed rate", "Reviewer flag", "Note", "Qty used", "Calculated total", "Check", "Group", ""].map((h, i) => (
                <th key={i} scope="col" className="px-1.5 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const r = results[i];
              const id = `fa-line-${keys[i]}`;
              const bad = r && isErr(r.check);
              return (
                <tr key={keys[i]} className="border-b border-neutral-border last:border-0">
                  <td className={`${cell} pt-3 tabular-nums`}>{i + 1}</td>
                  <td className={cell}>
                    <input aria-label={`Line ${i + 1} charge`} className={`${fieldClass} min-w-44`} value={l.charge} onChange={(e) => onChange(i, { charge: e.target.value })} />
                  </td>
                  <td className={cell}>
                    <SelectInput id={`${id}-category`} label={`Line ${i + 1} category`} className={`${fieldClass} min-w-56`} value={l.category} options={CATEGORY_NAMES} onChange={(v) => onChange(i, { category: v })} />
                  </td>
                  <td className={cell}>
                    <SelectInput id={`${id}-basis`} label={`Line ${i + 1} basis`} className={`${fieldClass} min-w-44`} value={l.basis} options={BASES} onChange={(v) => onChange(i, { basis: v })} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-rate`} label={`Line ${i + 1} rate`} className={small} value={l.rate} onChange={(v) => onChange(i, { rate: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <input aria-label={`Line ${i + 1} currency`} className={`${fieldClass} w-20`} value={l.currency} onChange={(e) => onChange(i, { currency: e.target.value })} />
                  </td>
                  <td className={cell}>
                    <SelectInput id={`${id}-status`} label={`Line ${i + 1} status`} className={`${fieldClass} min-w-32`} value={l.status} options={LINE_STATUSES} onChange={(v) => onChange(i, { status: v })} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-qty`} label={`Line ${i + 1} quantity override`} className={small} value={l.quantityOverride} onChange={(v) => onChange(i, { quantityOverride: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-min`} label={`Line ${i + 1} minimum charge`} className={small} value={l.minimumCharge} onChange={(v) => onChange(i, { minimumCharge: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-tax`} label={`Line ${i + 1} local tax percent`} className={`${fieldClass} w-20`} scale={100} value={l.localTaxRate} onChange={(v) => onChange(i, { localTaxRate: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-fwd`} label={`Line ${i + 1} forwarder's line total`} className={small} value={l.forwarderLineTotal} onChange={(v) => onChange(i, { forwarderLineTotal: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <NumberInput id={`${id}-agreed`} label={`Line ${i + 1} agreed rate`} className={small} value={l.agreedRate} onChange={(v) => onChange(i, { agreedRate: v })} onBad={onBad} />
                  </td>
                  <td className={cell}>
                    <SelectInput id={`${id}-flag`} label={`Line ${i + 1} reviewer flag`} className={`${fieldClass} min-w-44`} value={l.reviewerFlag} options={FLAG_NAMES} onChange={(v) => onChange(i, { reviewerFlag: v })} />
                  </td>
                  <td className={cell}>
                    <input aria-label={`Line ${i + 1} note`} className={`${fieldClass} min-w-44`} value={l.note} onChange={(e) => onChange(i, { note: e.target.value })} />
                  </td>
                  <td className={`${cell} pt-3 tabular-nums`}>{r ? cat(r.quantity) : ""}</td>
                  <td className={`${cell} pt-3 tabular-nums`}>{r ? cat(r.total) : ""}</td>
                  <td className={`${cell} pt-3 ${bad || cat(r?.check).startsWith("Error") ? "font-medium text-danger" : ""}`}>{r ? cat(r.check) : ""}</td>
                  <td className={`${cell} pt-3`}>{r ? r.group : ""}</td>
                  <td className={`${cell} pt-3`}>
                    <button type="button" className={linkButtonClass} onClick={() => onRemove(i)} aria-label={`Remove line ${i + 1}`}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className={secondaryButtonClass} disabled={lines.length >= MAX_LINES} onClick={onAdd}>
          Add charge line
        </button>
        <span className={hintClass}>
          {lines.length} of {MAX_LINES} lines
        </span>
      </div>
    </section>
  );
}
