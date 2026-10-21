"use client";

import { Plus, Trash2 } from "lucide-react";
import { MAX_EDITOR_COSTS, costFieldId, newCostRow, type CostRow, type ScenarioDraft } from "@/lib/landed-cost/editor-draft";
import { cardClass, hintClass, linkButtonClass, sectionTitleClass } from "../styles";
import { FieldError, TextInput } from "./fields";
import { updateScenario, type EditorSectionProps } from "./shipment-section";

const cellInput =
  "w-full rounded-lg border border-neutral-border bg-white px-2 py-1.5 text-sm text-move-navy focus:border-move-green focus:ring-2 focus:ring-move-green focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted aria-invalid:border-danger";

// 4. Other costs: free-form lines (insurance, brokerage, inland trucking…)
// added to the landed cost and split by entered value. Never part of the
// customs value, so no duty or MPF is charged on them.
export function OtherCostsSection({
  disabled,
  errors,
  update,
  newRef,
  scenario,
  step,
}: EditorSectionProps & { newRef: () => string; scenario: ScenarioDraft; step: string }) {
  const costs = scenario.otherCosts;
  const setCosts = (next: CostRow[]) => updateScenario(update, scenario.ref, { otherCosts: next });
  const setRow = (ref: string, change: Partial<CostRow>) => setCosts(costs.map((c) => (c.ref === ref ? { ...c, ...change } : c)));
  const addRow = () => {
    const ref = newRef();
    setCosts([...costs, newCostRow(ref)]);
    requestAnimationFrame(() => document.getElementById(costFieldId(ref, "label"))?.focus());
  };

  return (
    <section className={cardClass} aria-labelledby={`lc-costs-${scenario.ref}-title`}>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 id={`lc-costs-${scenario.ref}-title`} className={sectionTitleClass}>
          <span className="text-neutral-muted">{step}</span> Other costs
        </h2>
        <button type="button" onClick={addRow} disabled={disabled || costs.length >= MAX_EDITOR_COSTS} className={linkButtonClass}>
          <Plus aria-hidden="true" className="mr-1 inline size-4" />
          Add cost
        </button>
      </div>
      <p className={`${hintClass} mb-4`}>Not part of the customs value: no duty or MPF is charged on these. Up to {MAX_EDITOR_COSTS}.</p>
      {costs.length === 0 ? (
        <p className="text-sm text-neutral-muted">No other costs. Add insurance, brokerage or inland freight if they apply.</p>
      ) : (
        <table className="w-full text-left text-sm text-move-navy">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className="px-1.5 py-2 font-medium">Cost</th>
              <th scope="col" className="w-40 px-1.5 py-2 text-right font-medium">
                Amount <span className="normal-case">(USD)</span>
              </th>
              <th scope="col" className="w-10 px-1.5 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {costs.map((row, index) => {
              const name = row.label.trim() || `Cost ${index + 1}`;
              return (
                <tr key={row.ref} className="border-b border-neutral-border align-top last:border-0">
                  <td className="px-1.5 py-2">
                    <label htmlFor={costFieldId(row.ref, "label")} className="sr-only">
                      Cost {index + 1}: label
                    </label>
                    <TextInput id={costFieldId(row.ref, "label")} value={row.label} onValue={(v) => setRow(row.ref, { label: v })} errors={errors} disabled={disabled} maxLength={100} className={cellInput} placeholder="e.g. Customs brokerage" />
                    <FieldError id={costFieldId(row.ref, "label")} errors={errors} />
                  </td>
                  <td className="px-1.5 py-2">
                    <label htmlFor={costFieldId(row.ref, "amountUsd")} className="sr-only">
                      {name}: amount (USD)
                    </label>
                    <TextInput id={costFieldId(row.ref, "amountUsd")} value={row.amountUsd} onValue={(v) => setRow(row.ref, { amountUsd: v })} errors={errors} numeric disabled={disabled} className={cellInput} placeholder="0.00" />
                    <FieldError id={costFieldId(row.ref, "amountUsd")} errors={errors} />
                  </td>
                  <td className="px-1.5 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setCosts(costs.filter((c) => c.ref !== row.ref))}
                      disabled={disabled}
                      className="rounded-md p-1.5 text-neutral-muted hover:bg-neutral-bg hover:text-danger focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none disabled:cursor-not-allowed"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      <span className="sr-only">Remove {name}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
