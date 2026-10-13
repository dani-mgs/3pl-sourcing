import { formatDateOnly } from "@/lib/client-updates/dates";
import { monthTicks, timelinePosition, type Timeline } from "@/lib/client-updates/portal-data";
import { stageLabel } from "@/lib/client-updates/stages";
import { ChartFrame } from "./chart-frame";
import { DataTable } from "./charts";

// All engagements on one timeline (plain CSS). Done stretches are solid,
// the current stage is solid with a "now" label, planned stretches are
// striped, the red line is today, and milestones are ◆ (done ✓). Every
// meaning is in the caption and the list view too, never colour alone.

const STRIPES = "bg-[repeating-linear-gradient(45deg,#c3c9d8_0,#c3c9d8_4px,#ffffff_4px,#ffffff_8px)] border border-portal-grey";

export function PortalTimeline({ timeline }: { timeline: Timeline }) {
  const ticks = monthTicks(timeline);
  const at = (date: string) => `${timelinePosition(timeline, date)}%`;
  const width = (from: string, to: string) => `max(4px, ${timelinePosition(timeline, to) - timelinePosition(timeline, from)}%)`;

  const chart = (
    <div className="flex flex-col gap-1">
      <div className="relative ml-0 h-5 text-xs text-portal-muted sm:ml-44" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.date} className="absolute -translate-x-1/2" style={{ left: at(t.date) }}>
            {t.label}
          </span>
        ))}
      </div>
      {timeline.rows.map((row) => (
        <div key={row.key} className="grid gap-1 sm:grid-cols-[10.5rem_1fr] sm:items-center sm:gap-3">
          <span className={`text-sm font-semibold break-words ${row.kind === "forwarder" ? "text-portal-teal" : "text-portal-purple"}`}>
            {row.context}
          </span>
          <span className="relative block h-7 rounded bg-neutral-bg" aria-hidden="true">
            {row.segments.map((s, i) => (
              <span
                key={i}
                className={
                  "absolute inset-y-1 rounded " +
                  (s.state === "planned"
                    ? STRIPES
                    : s.state === "now"
                      ? "bg-portal-good"
                      : row.kind === "forwarder"
                        ? "bg-portal-teal"
                        : "bg-portal-purple")
                }
                style={{ left: at(s.from), width: width(s.from, s.to) }}
              />
            ))}
            {row.markers.map((m) => (
              <span
                key={`${m.label}-${m.date}`}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-portal-ink"
                style={{ left: at(m.date) }}
              >
                {m.done ? "✓" : "◆"}
              </span>
            ))}
            <span className="absolute -top-1 -bottom-1 border-l-2 border-[#b42318]" style={{ left: at(timeline.today) }} />
          </span>
        </div>
      ))}
    </div>
  );

  const rows = timeline.rows.flatMap((row) => [
    ...row.segments
      .filter((s) => s.state !== "planned")
      .map((s) => [
        row.context,
        `Stage ${s.stage} · ${stageLabel(s.stage)}${s.state === "now" ? " (now)" : ""}`,
        s.from === s.to ? formatDateOnly(s.from, timeline.today) : `${formatDateOnly(s.from, timeline.today)} – ${formatDateOnly(s.to, timeline.today)}`,
      ]),
    ...row.markers.map((m) => [
      row.context,
      `${m.label} (${m.done ? "done" : "planned"})`,
      formatDateOnly(m.date, timeline.today),
    ]),
  ]);

  return (
    <ChartFrame
      context="All your projects"
      title="Timeline across your projects"
      caption={`Solid = done, green = the current stage, striped = planned, red line = today (${formatDateOnly(timeline.today)}), ◆ = a planned milestone, ✓ = a milestone that's done.`}
      chart={chart}
      table={<DataTable caption="Timeline across your projects" head={["Project", "What", "When"]} rows={rows} />}
    />
  );
}
