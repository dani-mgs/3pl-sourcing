import type { ManualRateListRow } from "@/lib/landed-cost/manual-rate-draft";
import { cardClass, hintClass, linkButtonClass, sectionTitleClass } from "../styles";

// One origin's manual rates, every one listed for every viewer; the owner or
// an admin also gets Edit, Remove and the fixes for a conflict or a changed
// app rate. Add them from the result panel's duty layers.

export type ManualRatesActions = {
  edit: (skuRef: string, ref: string) => void;
  remove: (skuRef: string, ref: string) => void;
  keepMyRate: (skuRef: string, ref: string) => void;
  fixConflict: (overrideId: string) => void;
};

export function ManualRatesSection({
  rows,
  step,
  actions,
  overrideIdOf,
}: {
  rows: ManualRateListRow[];
  step: string;
  // Null: read-only.
  actions: ManualRatesActions | null;
  // The saved id of a listed row (for a conflict's fix), by ref.
  overrideIdOf: (ref: string) => string | null;
}) {
  return (
    <section className={cardClass} aria-labelledby="lc-manual-rates-title">
      <h2 id="lc-manual-rates-title" className={`${sectionTitleClass} mb-1`}>
        <span className="text-neutral-muted">{step}</span> Manual rates ({rows.length})
      </h2>
      <p className={`${hintClass} mb-4`}>
        {actions
          ? "Override a duty layer or add a manual duty from the result's duty layers. A manual rate never makes a result complete."
          : "Set by the workspace's owner or an admin. A manual rate never makes a result complete."}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-muted">None.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                <th scope="col" className="py-2 pr-3 font-medium">Layer</th>
                <th scope="col" className="py-2 pr-3 font-medium">Value</th>
                <th scope="col" className="py-2 pr-3 font-medium">Reason</th>
                <th scope="col" className="py-2 pr-3 font-medium">Set</th>
                <th scope="col" className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = overrideIdOf(r.ref);
                return (
                  <tr key={r.ref} className="border-b border-neutral-border align-top last:border-0">
                    <th scope="row" className="py-2 pr-3 font-medium">{r.skuCode}</th>
                    <td className="py-2 pr-3">{r.layer}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.value}</td>
                    <td className="py-2 pr-3">{r.reason}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-muted">{r.setBy ?? "—"}</td>
                    <td className="py-2 text-xs">
                      <p className={r.unsaved || r.conflict || r.note ? "font-semibold text-[#92400E]" : "font-medium"}>{r.status}</p>
                      {r.note && <p className="text-neutral-muted">{r.note}</p>}
                      {actions && (
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {r.conflict && id ? (
                            <button type="button" className={linkButtonClass} onClick={() => actions.fixConflict(id)}>
                              Fix<span className="sr-only"> the manual rate for {r.layer} on {r.skuCode}</span>
                            </button>
                          ) : (
                            <button type="button" className={linkButtonClass} onClick={() => actions.edit(r.skuRef, r.ref)}>
                              Edit<span className="sr-only"> the manual rate for {r.layer} on {r.skuCode}</span>
                            </button>
                          )}
                          {r.note ? (
                            <>
                              <button type="button" className={linkButtonClass} onClick={() => actions.remove(r.skuRef, r.ref)}>
                                Remove (use the app&apos;s rate)
                              </button>
                              <button type="button" className={linkButtonClass} onClick={() => actions.keepMyRate(r.skuRef, r.ref)}>
                                Keep my rate
                              </button>
                            </>
                          ) : (
                            <button type="button" className={linkButtonClass} onClick={() => actions.remove(r.skuRef, r.ref)}>
                              Remove<span className="sr-only"> the manual rate for {r.layer} on {r.skuCode}</span>
                            </button>
                          )}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
