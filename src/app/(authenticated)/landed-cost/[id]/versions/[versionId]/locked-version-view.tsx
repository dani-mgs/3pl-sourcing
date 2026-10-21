"use client";

import { useState } from "react";
import type { ComparisonView } from "@/lib/landed-cost/comparison-view";
import type { EditorDraft } from "@/lib/landed-cost/editor-draft";
import type { ResultView } from "@/lib/landed-cost/result-view";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { cardClass, hintClass, sectionTitleClass } from "../../../styles";
import { ComparisonArea } from "../../comparison-area";
import { OriginTabs } from "../../origin-controls";
import { ResultPanel } from "../../result-panel";
import type { Countries } from "../../shipment-section";

const PANEL_ID = "lc-version-panel";
const MODE: Record<string, string> = { Sea: "Sea (ocean)", Air: "Air", Road: "Road" };
const ENTRY: Record<string, string> = { auto: "Automatic", formal: "Formal" };
const FREIGHT_BASIS: Record<string, string> = { chargeable_weight: "Chargeable weight", value: "Value (FOB)", units: "Units" };

// A locked version, read-only: the stored inputs and the stored result, shown
// by the same panel and comparison as the live page. Nothing here edits or
// recalculates anything; tabs only switch which origin is shown.
export function LockedVersionView({
  draft,
  views,
  comparison,
  countries,
  subtitle,
}: {
  draft: EditorDraft;
  views: Record<string, ResultView>;
  comparison: ComparisonView;
  countries: Countries;
  subtitle: string;
}) {
  const [selectedRef, setSelectedRef] = useState(draft.baselineRef);
  const selected = draft.scenarios.find((s) => s.ref === selectedRef) ?? draft.scenarios[0];
  const multi = draft.scenarios.length > 1;
  const country = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const or = (text: string) => text || "—";

  return (
    <div className="flex flex-col gap-6">
      {multi && <ComparisonArea view={comparison} dirty={false} subtitle={subtitle} />}

      <section className={cardClass} aria-label="SKUs">
        <h2 className={sectionTitleClass}>SKUs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                <th scope="col" className="py-2 pr-3 font-medium">HTS code</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Qty (pcs)</th>
                <th scope="col" className="py-2 text-right font-medium">Duty quantity</th>
              </tr>
            </thead>
            <tbody>
              {draft.skus.map((s) => (
                <tr key={s.ref} className="border-b border-neutral-border last:border-0">
                  <th scope="row" className="py-2 pr-3 font-medium">{s.skuCode}</th>
                  <td className="py-2 pr-3">{or(s.description)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatHtsCode(s.htsCode)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{s.dutyQuantity ? `${s.dutyQuantity} ${s.dutyQuantityUnit}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {multi && <OriginTabs draft={draft} selectedRef={selected.ref} onSelect={setSelectedRef} countries={countries} panelId={PANEL_ID} />}
        <div
          id={PANEL_ID}
          role={multi ? "tabpanel" : undefined}
          aria-labelledby={multi ? `lc-tab-${selected.ref}` : undefined}
          className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"
        >
          <div className="flex min-w-0 flex-col gap-6">
            <section className={cardClass} aria-label={`Inputs, ${selected.label}`}>
              <h2 className={sectionTitleClass}>
                {selected.label}
                {selected.ref === draft.baselineRef && <span className="ml-2 text-sm font-normal text-neutral-muted">Baseline</span>}
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-move-navy sm:grid-cols-2">
                {[
                  ["Country of origin", country(selected.originCountry)],
                  ["Supplier", or(selected.supplierName)],
                  ["Incoterm", selected.incoterm],
                  ["Shipment mode", MODE[selected.shipmentMode] ?? selected.shipmentMode],
                  ["Entry type", ENTRY[selected.entryType] ?? selected.entryType],
                  ["Freight total (USD)", or(selected.freightTotalUsd)],
                  ["Freight split", FREIGHT_BASIS[selected.freightBasis] ?? selected.freightBasis],
                  ["Volumetric divisor", selected.volumetricDivisor || "Default for the mode"],
                ].map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-xs text-neutral-muted">{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm text-move-navy">
                  <caption className="mb-2 text-left text-xs font-semibold tracking-wide text-neutral-muted uppercase">FOB price and packing</caption>
                  <thead>
                    <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                      <th scope="col" className="py-2 pr-3 font-medium">SKU</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">FOB / unit (USD)</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Pcs / ctn</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">L × W × H (cm)</th>
                      <th scope="col" className="py-2 text-right font-medium">Ctn wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.skus.map((s) => {
                      const item = selected.items[s.ref];
                      const dims = item && item.cartonLengthCm ? `${item.cartonLengthCm} × ${item.cartonWidthCm} × ${item.cartonHeightCm}` : "—";
                      return (
                        <tr key={s.ref} className="border-b border-neutral-border last:border-0">
                          <th scope="row" className="py-2 pr-3 font-medium">{s.skuCode}</th>
                          <td className="py-2 pr-3 text-right tabular-nums">{or(item?.fobUnitPriceUsd ?? "")}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{or(item?.pcsPerCarton ?? "")}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{dims}</td>
                          <td className="py-2 text-right tabular-nums">{or(item?.cartonGrossKg ?? "")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">Other costs</p>
                {selected.otherCosts.length === 0 ? (
                  <p className={`${hintClass} mt-1`}>None.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-move-navy">
                    {selected.otherCosts.map((c) => (
                      <li key={c.ref}>
                        {c.label}: <span className="tabular-nums">{c.amountUsd} USD</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <ResultPanel
              view={selected.id ? (views[selected.id] ?? null) : null}
              dirty={false}
              lastSaved=""
              originLabel={multi ? selected.label : null}
              subtitle={subtitle}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
