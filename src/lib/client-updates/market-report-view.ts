import { percent, usd } from "./portal-text";
import {
  isNotTakenForward,
  REGION_LABELS,
  REPORT_OUTCOMES,
  SIZE_LABELS,
  type MarketReportPayload,
  type ReportOutcome,
  type ReportPartner,
} from "./market-report-schema";

// The words and figures of the paid Market Report page (Paid.dc.html),
// derived only from the payload. Pure, so the portal, "View as client" and
// the publish preview read the same.

export const OUTCOME_LABELS: Record<ReportOutcome, string> = {
  recommended: "Recommended",
  shortlisted: "Shortlisted as a backup",
  quoted_not_selected: "Quoted, not selected",
  quote_expired: "Quote expired",
  different_terms: "Quoted on different terms",
  didnt_quote: "Didn't quote",
  not_taken_forward: "Not taken forward",
};

// "What happened to all N": plural headings for the counts.
export const OUTCOME_GROUP_LABELS: Record<ReportOutcome, string> = {
  recommended: "Recommended",
  shortlisted: "Shortlisted as backups",
  quoted_not_selected: "Quoted, not selected",
  quote_expired: "Quote expired",
  different_terms: "Quoted on different terms",
  didnt_quote: "Didn't quote",
  not_taken_forward: "Not taken forward",
};

export function partnerName(p: ReportPartner): string {
  return "name" in p ? p.name : p.label;
}

export function profileText(p: ReportPartner): string {
  const parts = [p.size ? SIZE_LABELS[p.size] : null, p.region ? REGION_LABELS[p.region] : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type ReportFigures = {
  contacted: number;
  priced: number;
  likeForLike: number[];
  // Only with at least two like-for-like prices.
  range: { min: number; max: number } | null;
  median: number | null;
  today: number | null;
  // How many like-for-like prices are below what the client pays today.
  cheaperThanToday: number | null;
  position: "above" | "below" | "around" | null;
  counts: { outcome: ReportOutcome; count: number }[];
  offScale: ReportPartner[];
};

export function reportFigures(payload: MarketReportPayload): ReportFigures {
  const partners = payload.partners;
  const quoted = partners.filter((p) => !isNotTakenForward(p) && p.priceUsd != null);
  const lfl = quoted
    .filter((p) => !isNotTakenForward(p) && p.likeForLike)
    .map((p) => (p as { priceUsd: number }).priceUsd)
    .sort((a, b) => a - b);
  const enough = lfl.length >= 2;
  const med = enough ? median(lfl) : null;
  const today = payload.today.costUsd;
  const position =
    med == null || today == null ? null : Math.abs(today - med) < 0.005 * med ? "around" : today > med ? "above" : "below";
  return {
    contacted: partners.length,
    priced: quoted.length,
    likeForLike: lfl,
    range: enough ? { min: lfl[0], max: lfl.at(-1)! } : null,
    median: med,
    today,
    cheaperThanToday: enough && today != null ? lfl.filter((x) => x < today).length : null,
    position,
    counts: REPORT_OUTCOMES.map((outcome) => ({ outcome, count: partners.filter((p) => p.outcome === outcome).length })).filter(
      (c) => c.count > 0,
    ),
    offScale: quoted.filter((p) => !isNotTakenForward(p) && !p.likeForLike),
  };
}

export function positionTitle(f: ReportFigures): string {
  if (f.position === "above") return "You're paying above the middle of the market";
  if (f.position === "below") return "You're paying below the middle of the market";
  if (f.position === "around") return "You're paying about the middle of the market";
  return "Where the comparable quotes sit";
}

export function leadText(p: ReportPartner): string {
  if (isNotTakenForward(p)) return "—";
  const { leadMinDays: min, leadMaxDays: max } = p;
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

export function priceText(p: ReportPartner): string {
  return isNotTakenForward(p) || p.priceUsd == null ? "—" : usd(p.priceUsd);
}

// Against what the client pays today; only like-for-like quotes compare.
export function vsTodayText(p: ReportPartner, today: number | null): string {
  if (isNotTakenForward(p) || p.priceUsd == null) return "—";
  if (!p.likeForLike) return "Not comparable";
  if (today == null || today === 0) return "—";
  const diff = p.priceUsd - today;
  if (Math.abs(diff) < 0.005) return "Same as today";
  const sign = diff < 0 ? "−" : "+";
  return `${sign}${usd(Math.abs(Math.round(diff * 100) / 100))} (${sign}${percent(diff / today)})`;
}

export function offScaleText(f: ReportFigures): string | null {
  if (f.offScale.length === 0) return null;
  const list = f.offScale.map((p) => `${partnerName(p)} (${priceText(p)}${p.outcome === "quote_expired" ? ", expired" : ""})`);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return `Not on this scale: ${joined}. Their quotes are on different terms or have expired, so they aren't comparable with yours.`;
}
