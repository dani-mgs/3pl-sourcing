"use client";

import { useId, useState, type ReactNode } from "react";

// Every portal chart: a takeaway title (a sentence, never just "Freight
// cost"), the project it belongs to, a caption saying how to read it, and a
// Chart / Table switch showing the same numbers as a table.
export function ChartFrame({
  context,
  title,
  caption,
  chart,
  table,
}: {
  context: string;
  title: string;
  caption: string;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  const button = (value: "chart" | "table", label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-controls={`${id}-body`}
      onClick={() => setView(value)}
      className={
        "min-h-9 rounded-md px-3 text-[13px] font-semibold " +
        (view === value ? "bg-white text-move-navy shadow-sm" : "text-portal-muted hover:text-move-navy")
      }
    >
      {label}
    </button>
  );

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-portal-muted">{context}</p>
          <h4 id={`${id}-title`} className="mt-0.5 text-base font-bold text-portal-ink">
            {title}
          </h4>
        </div>
        <div role="group" aria-label="Show as" className="flex shrink-0 gap-1 rounded-lg bg-neutral-bg p-1">
          {button("chart", "Chart")}
          {button("table", "Table")}
        </div>
      </div>
      <figcaption className="text-sm text-portal-muted">{caption}</figcaption>
      <div id={`${id}-body`} className="min-w-0">
        {view === "chart" ? chart : table}
      </div>
    </figure>
  );
}
