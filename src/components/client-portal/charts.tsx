import type { ReactNode } from "react";
import type { ForwarderOption } from "@/lib/client-updates/payload-schema";
import { EXPIRED_NOTE, NOT_COMPARABLE_NOTE, usd, vsToday } from "@/lib/client-updates/portal-text";

// Plain CSS charts for the client portal (no chart library). Every bar has
// its value and meaning written next to it; colour is never the only signal:
// recommended / not comparable / expired are words, and reference lines are
// dashed (today) or dotted (target) with a text legend in the caption.

type Tone = "teal" | "purple";

const fill = (tone: Tone) => (tone === "teal" ? "bg-portal-teal" : "bg-portal-purple");

function pct(value: number, max: number): string {
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="border-b border-portal-line px-2 py-2 text-left font-semibold text-portal-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="border-b border-neutral-border px-2 py-2 text-left font-medium text-portal-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="border-b border-neutral-border px-2 py-2 text-portal-ink">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Funnel -----------------------------------------------------------------------

export function FunnelBars({ steps, tone }: { steps: { label: string; count: number }[]; tone: Tone }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ul className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
          <span className="text-portal-ink">{s.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`h-5 rounded ${fill(tone)}`} style={{ width: pct(s.count, max) }} aria-hidden="true" />
            <span className="font-semibold text-portal-ink">{s.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---- Forwarder freight cost -----------------------------------------------------------

export function optionNote(o: ForwarderOption, comparability: ForwarderOption["comparability"]): string | null {
  if (comparability === "different_terms") return NOT_COMPARABLE_NOTE;
  if (comparability === "expired") return EXPIRED_NOTE;
  if (comparability === "not_comparable") return "Not directly comparable: the quote is incomplete.";
  if (comparability === "no_price") return "No price yet.";
  return null;
}

export function CostBars({
  options,
  todayUsd,
  tone,
  comparabilityOf,
}: {
  options: ForwarderOption[];
  todayUsd: number | null;
  tone: Tone;
  comparabilityOf: (o: ForwarderOption) => ForwarderOption["comparability"];
}) {
  const priced = options.filter((o) => o.costUsd != null);
  const max = Math.max(1, todayUsd ?? 0, ...priced.map((o) => o.costUsd!)) * 1.05;
  return (
    <div className="flex flex-col gap-3">
      {todayUsd != null && (
        <Row label="Today" detail={usd(todayUsd)}>
          <span className="h-5 rounded border-2 border-dashed border-portal-ink bg-white" style={{ width: pct(todayUsd, max) }} aria-hidden="true" />
        </Row>
      )}
      {priced.map((o) => {
        const comparability = comparabilityOf(o);
        const comparable = comparability === "like_for_like";
        const note = optionNote(o, comparability);
        return (
          <Row
            key={o.name}
            label={`${o.name}${o.role === "recommended" ? " · Recommended" : ""}`}
            detail={`${usd(o.costUsd!)}${comparable && o.savingPct != null ? ` · ${vsToday(o.savingPct)}` : ""}`}
            note={note}
          >
            <span className="relative block h-5 w-full" aria-hidden="true">
              <span
                className={`absolute inset-y-0 left-0 rounded ${comparable ? fill(tone) : "border border-portal-grey bg-[repeating-linear-gradient(45deg,#c3c9d8_0,#c3c9d8_4px,#eef1f7_4px,#eef1f7_8px)]"}`}
                style={{ width: pct(o.costUsd!, max) }}
              />
              {todayUsd != null && <TodayLine at={pct(todayUsd, max)} />}
            </span>
          </Row>
        );
      })}
    </div>
  );
}

function TodayLine({ at }: { at: string }) {
  return <span className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-portal-ink" style={{ left: at }} />;
}

function Row({ label, detail, note, children }: { label: string; detail: string; note?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold text-portal-ink">{label}</span>
        <span className="text-portal-ink">{detail}</span>
      </div>
      <div className="flex min-w-0">{children}</div>
      {note && <p className="text-xs text-portal-grey">{note}</p>}
    </div>
  );
}

// ---- Lead time ranges --------------------------------------------------------------------

export function LeadTimeRanges({
  options,
  todayDays,
  targetDays,
  tone,
}: {
  options: ForwarderOption[];
  todayDays: number | null;
  targetDays: number | null;
  tone: Tone;
}) {
  const rows = options.filter((o) => o.leadMinDays != null || o.leadMaxDays != null);
  const max = Math.max(1, todayDays ?? 0, targetDays ?? 0, ...rows.map((o) => o.leadMaxDays ?? o.leadMinDays!)) * 1.1;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((o) => {
        const min = o.leadMinDays ?? o.leadMaxDays!;
        const maxDays = o.leadMaxDays ?? o.leadMinDays!;
        return (
          <Row key={o.name} label={o.name} detail={min === maxDays ? `${min} days` : `${min}–${maxDays} days`}>
            <span className="relative block h-5 w-full" aria-hidden="true">
              <span className="absolute inset-y-2 left-0 right-0 rounded bg-neutral-border" />
              <span
                className={`absolute inset-y-0 rounded ${fill(tone)}`}
                style={{ left: pct(min, max), width: `max(6px, ${pct(maxDays - min, max)})` }}
              />
              {todayDays != null && (
                <span className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-portal-ink" style={{ left: pct(todayDays, max) }} />
              )}
              {targetDays != null && (
                <span className="absolute -top-1 -bottom-1 border-l-2 border-dotted border-portal-good" style={{ left: pct(targetDays, max) }} />
              )}
            </span>
          </Row>
        );
      })}
    </div>
  );
}

// ---- 3PL: percent against today's rate card ----------------------------------------------

export function SavingBars({ options, tone }: { options: { name: string; role: string; savingPct: number | null }[]; tone: Tone }) {
  const rows = options.filter((o) => o.savingPct != null);
  const max = Math.max(0.01, ...rows.map((o) => Math.abs(o.savingPct!))) * 1.1;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((o) => {
        const below = o.savingPct! > 0;
        return (
          <Row key={o.name} label={`${o.name}${o.role === "recommended" ? " · Recommended" : ""}`} detail={vsToday(o.savingPct!)}>
            <span
              className={`h-5 rounded ${below ? fill(tone) : "border border-portal-grey bg-[repeating-linear-gradient(45deg,#c3c9d8_0,#c3c9d8_4px,#eef1f7_4px,#eef1f7_8px)]"}`}
              style={{ width: `max(6px, ${pct(Math.abs(o.savingPct!), max)})` }}
              aria-hidden="true"
            />
          </Row>
        );
      })}
    </div>
  );
}
