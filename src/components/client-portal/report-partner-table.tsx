"use client";

import { useId, useState } from "react";

// "Every forwarder we evaluated", with an All / Like-for-like only switch.
// Receives display text only (built on the server from the payload).

export type PartnerRowView = {
  key: string;
  name: string;
  named: boolean;
  profile: string;
  price: string;
  vs: string;
  lead: string;
  take: string | null;
  outcome: string;
  likeForLike: boolean;
};

export function ReportPartnerTable({ rows, caption }: { rows: PartnerRowView[]; caption: string }) {
  const [onlyComparable, setOnlyComparable] = useState(false);
  const id = useId();
  const shown = onlyComparable ? rows.filter((r) => r.likeForLike) : rows;
  const comparable = rows.filter((r) => r.likeForLike).length;
  const button = (value: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={onlyComparable === value}
      aria-controls={`${id}-table`}
      onClick={() => setOnlyComparable(value)}
      className={
        "min-h-9 rounded-md px-3 text-[13px] font-semibold " +
        (onlyComparable === value ? "bg-white text-move-navy shadow-sm" : "text-portal-muted hover:text-move-navy")
      }
    >
      {text}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div role="group" aria-label="Show" className="flex w-fit gap-1 rounded-lg bg-neutral-bg p-1">
        {button(false, `All ${rows.length}`)}
        {button(true, `Like-for-like only (${comparable})`)}
      </div>
      <div className="min-w-0 overflow-x-auto rounded-xl border border-neutral-border">
        <table id={`${id}-table`} className="w-full min-w-[760px] border-collapse text-left text-sm text-portal-ink">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-neutral-bg text-xs text-portal-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Forwarder</th>
              <th scope="col" className="px-3 py-2 font-semibold">Profile</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Per shipment</th>
              <th scope="col" className="px-3 py-2 font-semibold">vs. today</th>
              <th scope="col" className="px-3 py-2 font-semibold">Transit</th>
              <th scope="col" className="px-3 py-2 font-semibold">Move&apos;s take</th>
              <th scope="col" className="px-3 py-2 font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-neutral-border align-top">
                <th scope="row" className={`px-3 py-2 ${r.named ? "font-bold" : "font-semibold"}`}>
                  {r.name}
                </th>
                <td className="px-3 py-2">{r.profile}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.price}</td>
                <td className="px-3 py-2">{r.vs}</td>
                <td className="px-3 py-2">{r.lead}</td>
                <td className="px-3 py-2">{r.take ?? "—"}</td>
                <td className="px-3 py-2">{r.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
