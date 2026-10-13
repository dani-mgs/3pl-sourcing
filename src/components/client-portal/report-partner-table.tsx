"use client";

import { useId, useState } from "react";
import { ACTION_LABELS, STATUS_LABELS } from "@/lib/client-requests/text";
import { IntroductionButton } from "./request-dialogs";

// "Every forwarder we evaluated", with an All / Like-for-like only switch.
// Receives display text only (built on the server from the payload). With
// `introductions`, lettered rows that can be introduced get an Introduction
// column: the client's button, or what was already asked.
//
// Below md the same rows are stacked cards instead of the table (which would
// scroll sideways and hide the Introduction column on a phone). Both are in
// the HTML and CSS hides one, so the server and client render the same and
// only the visible copy reaches assistive tech.

// A lettered row that can be asked for: its letter ("D"), and the request
// already sent for it, if any.
export type IntroductionCell = {
  letter: string;
  requested: { status: string; from: string } | null;
};

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
  intro?: IntroductionCell | null;
};

export function ReportPartnerTable({
  rows,
  caption,
  introductions,
}: {
  rows: PartnerRowView[];
  caption: string;
  introductions?: { engagementKey: string; mode: "client" | "view" };
}) {
  const [onlyComparable, setOnlyComparable] = useState(false);
  const id = useId();
  const shown = onlyComparable ? rows.filter((r) => r.likeForLike) : rows;
  const comparable = rows.filter((r) => r.likeForLike).length;
  const button = (value: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={onlyComparable === value}
      aria-controls={`${id}-table ${id}-cards`}
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
      <ul id={`${id}-cards`} aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {shown.map((r) => (
          <PartnerCard key={r.key} row={r} introductions={introductions} />
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-neutral-border md:block">
        <table
          id={`${id}-table`}
          className={`w-full ${introductions ? "min-w-[920px]" : "min-w-[760px]"} border-collapse text-left text-sm text-portal-ink`}
        >
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
              {introductions && <th scope="col" className="px-3 py-2 font-semibold">Introduction</th>}
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
                {introductions && (
                  <td className="px-3 py-2">
                    <IntroductionCellView cell={r.intro ?? null} engagementKey={introductions.engagementKey} mode={introductions.mode} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One partner on a phone: the table row's fields, top to bottom, and the
// Introduction cell across the bottom (its button full width).
function PartnerCard({
  row: r,
  introductions,
}: {
  row: PartnerRowView;
  introductions?: { engagementKey: string; mode: "client" | "view" };
}) {
  const fields: [string, string][] = [
    ["Profile", r.profile],
    ["Per shipment", r.price],
    ["vs. today", r.vs],
    ["Transit", r.lead],
    ["Move's take", r.take ?? "—"],
  ];
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-neutral-border bg-white p-4 text-sm text-portal-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className={`text-base ${r.named ? "font-bold" : "font-semibold"}`}>{r.name}</h4>
        <span className="text-xs text-portal-muted">{r.outcome}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-portal-muted">{label}</dt>
            <dd className={label === "Per shipment" ? "tabular-nums" : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      {introductions && (
        <div className="border-t border-neutral-border pt-3 [&>button]:w-full">
          <IntroductionCellView cell={r.intro ?? null} engagementKey={introductions.engagementKey} mode={introductions.mode} />
        </div>
      )}
    </li>
  );
}

function IntroductionCellView({ cell, engagementKey, mode }: { cell: IntroductionCell | null; engagementKey: string; mode: "client" | "view" }) {
  if (!cell) return <span className="text-portal-muted">—</span>;
  if (cell.requested) {
    return (
      <span className="flex flex-col">
        <span className="font-semibold">{ACTION_LABELS.introductionRequested}</span>
        <span className="text-xs text-portal-muted">
          {STATUS_LABELS[cell.requested.status] ?? cell.requested.status} · {cell.requested.from}
        </span>
      </span>
    );
  }
  if (mode === "view") return <span className="text-xs text-portal-muted">Client sees: {ACTION_LABELS.requestIntroduction}</span>;
  return <IntroductionButton engagementKey={engagementKey} letter={cell.letter} />;
}
