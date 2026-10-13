import { daysBetween, formatDateOnly, isIsoDate, utcDateOf } from "./dates";
import { parsePayload, type ClientUpdatePayload } from "./payload-schema";
import { kindLabel, nextStepText, projectContext, type ClientUpdateView } from "./portal-text";

// Turns the rows my_portal_updates() / portal_updates_for_client() return
// into what the portal shows: one engagement per project (latest update plus
// history), the key figures, what needs the client, and the timeline. Pure;
// everything comes from published snapshots only. "today" is the server's
// UTC date (docs/TECH_DEBT.md).

export type PortalRow = {
  engagement_key: string;
  project_kind: string;
  stage: number;
  headline: string;
  summary: string;
  next_step: string | null;
  next_step_due: string | null;
  needs_client_action: boolean;
  published_at: string;
  payload: unknown;
  // Phase 3a: the update's opaque key (to approve exactly that update).
  update_key?: string | null;
};

export type Engagement = {
  key: string;
  kind: ClientUpdatePayload["kind"];
  latest: ClientUpdateView;
  // Newest first, the latest included.
  history: ClientUpdateView[];
  complete: boolean;
  latestUpdateKey: string | null;
};

export type PortalData = {
  engagements: Engagement[];
  // Rows whose payload couldn't be read (shown as a short note, never raw).
  unreadable: number;
};

function toView(row: PortalRow, payload: ClientUpdatePayload): ClientUpdateView {
  return {
    stage: row.stage,
    headline: row.headline,
    summary: row.summary,
    nextStep: row.next_step,
    nextStepDue: row.next_step_due,
    needsClientAction: row.needs_client_action,
    publishedAt: row.published_at,
    payload,
  };
}

// Active engagements first (those needing the client at the top, then the
// most recently updated), completed ones last.
export function toPortalData(rows: PortalRow[]): PortalData {
  const groups = new Map<string, ClientUpdateView[]>();
  const keys = new Map<ClientUpdateView, string | null>();
  let unreadable = 0;
  for (const row of rows) {
    const payload = parsePayload(row.payload);
    if (!payload || payload.kind !== row.project_kind) {
      unreadable += 1;
      continue;
    }
    const list = groups.get(row.engagement_key) ?? [];
    const view = toView(row, payload);
    keys.set(view, row.update_key ?? null);
    list.push(view);
    groups.set(row.engagement_key, list);
  }
  const engagements = [...groups.entries()].map(([key, views]) => {
    const history = [...views].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const latest = history[0];
    return { key, kind: latest.payload.kind, latest, history, complete: latest.stage === 7, latestUpdateKey: keys.get(latest) ?? null };
  });
  engagements.sort(
    (a, b) =>
      Number(a.complete) - Number(b.complete) ||
      Number(b.latest.needsClientAction) - Number(a.latest.needsClientAction) ||
      (b.latest.publishedAt ?? "").localeCompare(a.latest.publishedAt ?? ""),
  );
  return { engagements, unreadable };
}

// ---- Key figures -------------------------------------------------------------------

export type KeyFigures = {
  active: number;
  waiting: number;
  // Null when no published update shares the search progress.
  contacted: number | null;
  bestSaving: { pct: number; kind: ClientUpdatePayload["kind"]; context: string } | null;
};

// decided: projects whose latest update the client already decided on.
export function keyFigures(engagements: Engagement[], decided: Set<string> = new Set()): KeyFigures {
  const active = engagements.filter((e) => !e.complete);
  let contacted: number | null = null;
  let bestSaving: KeyFigures["bestSaving"] = null;
  for (const e of engagements) {
    const funnel = e.latest.payload.funnel;
    const step = funnel?.find((s) => s.step === "contacted");
    if (step) contacted = (contacted ?? 0) + step.count;
    if (e.complete) continue;
    const best = e.latest.payload.comparison.bestSaving;
    if (best && best.pct > 0 && (!bestSaving || best.pct > bestSaving.pct)) {
      bestSaving = { pct: best.pct, kind: e.kind, context: projectContext(e.latest.payload) };
    }
  }
  return {
    active: active.length,
    waiting: active.filter((e) => e.latest.needsClientAction && !decided.has(e.key)).length,
    contacted,
    bestSaving,
  };
}

// ---- What needs the client -----------------------------------------------------------

export type NeedsYouItem = { key: string; text: string };

// A decision (approve or request changes) on the latest update clears it
// until the next update.
export function needsYou(engagements: Engagement[], today: string, decided: Set<string> = new Set()): NeedsYouItem[] {
  return engagements
    .filter((e) => !e.complete && e.latest.needsClientAction && !decided.has(e.key))
    .map((e) => {
      const what = nextStepText(e.latest, today) ?? "Something needs your input";
      return { key: e.key, text: `${what} (your ${kindLabel(e.kind).charAt(0).toLowerCase()}${kindLabel(e.kind).slice(1)})` };
    });
}

// ---- Timeline ---------------------------------------------------------------------------

export type TimelineSegment = { from: string; to: string; stage: number; state: "done" | "now" | "planned" };
export type TimelineMarker = { date: string; label: string; done: boolean };
export type TimelineRow = {
  key: string;
  kind: ClientUpdatePayload["kind"];
  context: string;
  segments: TimelineSegment[];
  markers: TimelineMarker[];
};
export type Timeline = { start: string; end: string; today: string; rows: TimelineRow[] };

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

// Stage segments from the published history (each update's stage until the
// next update; the latest until today), then a planned stretch from today to
// the last planned milestone. Milestones are markers.
export function buildTimeline(engagements: Engagement[], today: string): Timeline | null {
  if (engagements.length === 0) return null;
  let start = today;
  let end = today;
  const rows: TimelineRow[] = engagements.map((e) => {
    const ascending = [...e.history].reverse();
    const segments: TimelineSegment[] = [];
    ascending.forEach((view, i) => {
      const from = utcDateOf(view.publishedAt!);
      const next = ascending[i + 1];
      const to = next ? utcDateOf(next.publishedAt!) : e.complete ? from : maxDate(today, from);
      const last = i === ascending.length - 1;
      segments.push({ from, to, stage: view.stage, state: last && !e.complete ? "now" : "done" });
      if (from < start) start = from;
      if (to > end) end = to;
    });
    const markers = e.latest.payload.milestones
      .map((m) => ({ date: m.actual ?? m.planned!, label: m.label, done: m.actual != null }))
      .filter((m) => isIsoDate(m.date));
    const plannedEnd = markers.filter((m) => !m.done && m.date > today).map((m) => m.date).sort().at(-1);
    if (plannedEnd && !e.complete) segments.push({ from: today, to: plannedEnd, stage: e.latest.stage, state: "planned" });
    for (const m of markers) {
      if (m.date < start) start = m.date;
      if (m.date > end) end = m.date;
    }
    return { key: e.key, kind: e.kind, context: projectContext(e.latest.payload), segments, markers };
  });
  // A little room on both sides.
  return { start: shift(start, -3), end: shift(end, 7), today, rows };
}

export function shift(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Position of a date on the timeline, 0-100.
export function timelinePosition(t: Timeline, date: string): number {
  const span = Math.max(1, daysBetween(t.start, t.end));
  return Math.max(0, Math.min(100, (daysBetween(t.start, date) / span) * 100));
}

// First-of-month labels between start and end.
export function monthTicks(t: Timeline): { date: string; label: string }[] {
  const ticks: { date: string; label: string }[] = [];
  const [y, m] = t.start.split("-").map(Number);
  let year = y;
  let month = m;
  for (;;) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    if (date > t.end) break;
    // "Oct", or "Jan 2027" outside today's year.
    ticks.push({ date, label: formatDateOnly(date, t.today).replace(/ 1(,)?/, "") });
  }
  return ticks;
}

// ---- Last updated --------------------------------------------------------------------------

export function lastUpdated(engagements: Engagement[]): { publishedAt: string; author: string | null } | null {
  const views = engagements.map((e) => e.latest).filter((v) => v.publishedAt);
  const newest = views.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))[0];
  return newest ? { publishedAt: newest.publishedAt!, author: newest.payload.author.firstName } : null;
}
