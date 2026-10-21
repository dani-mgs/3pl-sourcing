import { AlertTriangle, Info, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { ComparisonView, ExcludedOrigin } from "@/lib/landed-cost/comparison-view";
import { cardClass, hintClass, sectionTitleClass } from "../styles";

// The origins side by side, from the last save (toComparisonView). Every
// status and mark is a word; colour and bars only repeat it.

const WARNING_BOX = "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]";
const INFO_BOX = "rounded-xl bg-neutral-bg px-4 py-3 text-sm text-move-navy";

function Box({ tone, children }: { tone: "info" | "warning"; children: ReactNode }) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`${tone === "info" ? INFO_BOX : WARNING_BOX} flex items-start gap-2`} role={tone === "info" ? "status" : "note"}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Excluded({ origins }: { origins: ExcludedOrigin[] }) {
  if (origins.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">Left out of the comparison</p>
      <ul className="flex flex-col gap-1 text-sm text-move-navy">
        {origins.map((o) => (
          <li key={o.label}>
            <span className="font-medium">{o.label}</span>: {o.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

const Mark = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-xs font-semibold text-move-navy">{children}</span>
);

function Ready({ view }: { view: Extract<ComparisonView, { state: "ready" }> }) {
  return (
    <>
      {view.verdict ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">Verdict · landed cost per unit</p>
          <p className="font-display text-xl font-semibold text-move-navy" data-testid="lc-verdict">
            {view.verdict.text}
          </p>
          <p className="text-sm text-move-navy">{view.verdict.perShipment}</p>
        </div>
      ) : (
        <Box tone="info">
          <p>{view.noRankingNote}</p>
        </Box>
      )}
      {view.caution && (
        <Box tone="warning">
          <p>{view.caution}</p>
        </Box>
      )}
      {view.modes && <p className="text-sm text-move-navy">Different shipment modes: {view.modes}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {view.ranking.length > 0 && (
          <table className="w-full text-left text-sm text-move-navy">
            <caption className="mb-2 text-left text-xs font-semibold tracking-wide text-neutral-muted uppercase">Ranking</caption>
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="py-2 pr-2 font-medium">#</th>
                <th scope="col" className="py-2 pr-2 font-medium">Origin</th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">Per unit</th>
                <th scope="col" className="py-2 text-right font-medium">Shipment</th>
              </tr>
            </thead>
            <tbody>
              {view.ranking.map((r) => (
                <tr key={r.scenarioId} className="border-b border-neutral-border align-top last:border-0">
                  <td className="py-2 pr-2 tabular-nums">{r.rank}</td>
                  <td className="py-2 pr-2">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.label}
                      {r.isBaseline && <Mark>Baseline</Mark>}
                      {r.position && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                          {r.position === "Lowest landed cost" && <Trophy aria-hidden="true" className="size-3.5" />}
                          {r.position}
                        </span>
                      )}
                    </p>
                    {!r.isBaseline && <p className="text-xs text-neutral-muted">{r.vsBaseline}</p>}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.perUnit}</td>
                  <td className="py-2 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-muted uppercase">Landed cost per unit</p>
          <ul className="flex flex-col gap-2">
            {view.bars.map((b) => (
              <li key={b.scenarioId} className="flex flex-col gap-1">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-move-navy">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {b.label}
                    {b.marks.map((m) => (
                      <Mark key={m}>{m}</Mark>
                    ))}
                  </span>
                  <span className="tabular-nums">{b.perUnit}</span>
                </p>
                <div className="h-3 rounded-full bg-neutral-bg" aria-hidden="true">
                  <div
                    className={`h-3 rounded-full ${b.marks.includes("Not comparable") ? "bg-neutral-muted/40" : b.marks.includes("Baseline") ? "bg-move-navy" : "bg-move-green"}`}
                    style={{ width: `${b.widthPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-move-navy">
          <caption className="mb-2 text-left text-xs font-semibold tracking-wide text-neutral-muted uppercase">Per SKU · landed cost per unit</caption>
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className="py-2 pr-4 font-medium">SKU</th>
              {view.skuTable.columns.map((c) => (
                <th key={c.scenarioId} scope="col" className="py-2 pr-4 text-right font-medium">
                  {c.label}
                  {c.note && <span className="block text-[10px] normal-case">{c.note}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.skuTable.rows.map((r) => (
              <tr key={r.skuCode} className="border-b border-neutral-border last:border-0">
                <th scope="row" className="py-2 pr-4 font-medium">{r.skuCode}</th>
                {r.cells.map((cell, i) => (
                  <td key={view.skuTable.columns[i].scenarioId} className={`py-2 pr-4 text-right tabular-nums ${cell.mark ? "font-semibold text-[#15803D]" : ""}`}>
                    {cell.text}
                    {cell.mark && <span className="block text-xs">{cell.mark}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.drivers.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">What drives the difference, against the baseline</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {view.drivers.map((d) => (
              <div key={d.scenarioId} className="rounded-xl border border-neutral-border p-4">
                <p className="font-medium text-move-navy">{d.label}</p>
                <p className="text-sm text-move-navy">{d.summary}</p>
                <ul className="mt-2 flex flex-col gap-0.5 text-sm text-move-navy">
                  {d.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {d.roundedNote && <p className={`${hintClass} mt-1`}>Per-unit amounts are rounded.</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view.notComparable.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">Not comparable with the baseline</p>
          <ul className="flex flex-col gap-1 text-sm text-move-navy">
            {view.notComparable.map((n) => (
              <li key={n.label}>
                <span className="font-medium">{n.label}</span>: {n.reasons.join(" ")} Its own totals still show; it isn&apos;t ranked.
              </li>
            ))}
          </ul>
        </div>
      )}
      <Excluded origins={view.excluded} />
    </>
  );
}

// `subtitle` replaces "As of your last save…" (a locked version).
export function ComparisonArea({ view, dirty, subtitle = null }: { view: ComparisonView; dirty: boolean; subtitle?: string | null }) {
  if (view.state === "hidden") return null;
  return (
    <section className={`${cardClass} flex flex-col gap-4`} aria-labelledby="lc-compare-title">
      <div>
        <h2 id="lc-compare-title" className={sectionTitleClass}>
          Compare origins
        </h2>
        <p className={hintClass}>{subtitle ?? "As of your last save, calculated on the server."}</p>
        {dirty && <p className="mt-1 text-xs font-semibold text-[#92400E]">Unsaved changes: save to update the comparison.</p>}
      </div>
      {view.state === "ready" ? (
        <Ready view={view} />
      ) : (
        <>
          <Box tone="info">
            <p>{view.note}</p>
          </Box>
          {"excluded" in view && <Excluded origins={view.excluded} />}
        </>
      )}
    </section>
  );
}

// Shown instead when origins were added in the draft but not saved yet.
export function CompareAfterSave() {
  return (
    <section className={cardClass} aria-label="Compare origins">
      <h2 className={sectionTitleClass}>Compare origins</h2>
      <p className="mt-2 text-sm text-move-navy">Save the draft to compare these origins.</p>
    </section>
  );
}
