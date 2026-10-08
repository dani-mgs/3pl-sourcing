import { formatRateDate } from "@/lib/fx/rate-provenance";
import type { KeyDate } from "@/lib/tariff/key-dates";

// Upcoming dated changes already in the duty data. Read-only; no hooks, so it
// renders on the server.
export function KeyDatesPanel({ dates }: { dates: KeyDate[] }) {
  return (
    <details className="group mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm" data-testid="key-dates">
      <summary className="cursor-pointer font-display text-lg font-semibold text-move-navy outline-none focus-visible:ring-2 focus-visible:ring-move-green">
        Key dates{dates.length > 0 && <span className="ml-2 text-sm font-normal text-neutral-muted">({dates.length} upcoming)</span>}
      </summary>
      {dates.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-muted">
          No dated changes are loaded right now. Rates that start or end on a set date will be listed here.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-neutral-muted">
            Changes already in the duty data, by the day they take effect. Only what has been loaded is listed;
            an estimate for a later entry date applies them automatically.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-neutral-border text-sm text-move-navy">
            {dates.map((d) => (
              <li key={`${d.programKey}-${d.heading}-${d.date}-${d.kind}`} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
                <span className="w-32 shrink-0 font-medium tabular-nums">{formatRateDate(d.date)}</span>
                <span>
                  <span className="font-medium">{d.programName}</span> · {d.heading} {d.label}
                  <span className="block text-xs text-neutral-muted">
                    {d.kind === "starts" ? "Starts" : "Ends"}: {d.change} · {d.covers}
                    {!d.counted && " · program not counted in estimates yet (pending review)"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
