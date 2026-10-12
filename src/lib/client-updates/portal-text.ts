import { daysBetween, formatDateOnly } from "./dates";
import type { ClientUpdatePayload, ForwarderOption, ForwarderPayload, ThreePlPayload } from "./payload-schema";

// The words the client portal shows: takeaway titles, captions and empty
// states (client dashboard plan, sections 5, 7 and 10). Pure, so they're
// tested on their own and read the same in the publish preview, "View as
// client" and the portal.

export const ESTIMATES_FOOTER =
  "Figures are estimates based on quotes received; final costs depend on the signed agreement.";

export const NOT_COMPARABLE_NOTE = "Not directly comparable: different delivery terms.";
export const EXPIRED_NOTE = "Expired: we're re-confirming the price.";

// How long before a quote expires the portal warns (plan section 5.3).
export const VALIDITY_WARNING_DAYS = 14;

export type ClientUpdateView = {
  stage: number;
  headline: string;
  summary: string;
  nextStep: string | null;
  nextStepDue: string | null;
  needsClientAction: boolean;
  // Null in a preview (not published yet).
  publishedAt: string | null;
  payload: ClientUpdatePayload;
};

export function kindLabel(kind: ClientUpdatePayload["kind"]): string {
  return kind === "forwarder" ? "Freight forwarder project" : "Warehouse (3PL) project";
}

// "Freight forwarder project · Ho Chi Minh City → Los Angeles": on every
// heading, chart and card, so figures from two projects can't be mixed up.
export function projectContext(payload: ClientUpdatePayload): string {
  const route = payload.project.route;
  return route ? `${kindLabel(payload.kind)} · ${route}` : kindLabel(payload.kind);
}

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function usd(amount: number): string {
  return Number.isInteger(amount) ? usdFormat.format(amount) : usdCents.format(amount);
}

// 0.1 -> "10%", 0.058 -> "5.8%".
export function percent(fraction: number): string {
  const value = Math.round(Math.abs(fraction) * 1000) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

// A saving (positive = cheaper than today) in words, never by colour alone.
export function vsToday(savingPct: number): string {
  if (Math.round(savingPct * 1000) === 0) return "Same as today";
  return savingPct > 0 ? `${percent(savingPct)} below today` : `${percent(savingPct)} above today`;
}

// Expired at render time too: a quote shared as like-for-like that has since
// passed its validity date is shown as expired.
export function displayComparability(option: ForwarderOption, today: string): ForwarderOption["comparability"] {
  if (option.comparability === "like_for_like" && option.validUntil && daysBetween(today, option.validUntil) < 0) {
    return "expired";
  }
  return option.comparability;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---- Funnel ---------------------------------------------------------------------

export const FUNNEL_LABELS: Record<string, string> = {
  contacted: "Contacted",
  replied: "Replied",
  quoted: "Quoted",
  like_for_like: "Like-for-like quote",
  shortlisted: "Shortlisted",
  recommended: "Recommended",
};

export function funnelTitle(payload: ClientUpdatePayload): string {
  const steps = payload.funnel ?? [];
  const contacted = steps.find((s) => s.step === "contacted")?.count ?? 0;
  const shortlisted = steps.find((s) => s.step === "shortlisted")?.count ?? 0;
  const noun = payload.kind === "forwarder" ? "forwarder" : "warehouse";
  if (shortlisted > 0) return `We contacted ${plural(contacted, noun)}; ${shortlisted} ${shortlisted === 1 ? "is" : "are"} on your shortlist`;
  return `We've contacted ${plural(contacted, noun)} so far`;
}

export const FUNNEL_CAPTION =
  "Number of partners at each step. We start wide and narrow down: partners drop out for capacity, location or price.";

// ---- Forwarder cost -------------------------------------------------------------

export function forwarderCostTitle(c: ForwarderPayload["comparison"], today: string): string {
  const best = c.bestSaving && c.options.find((o) => o.name === c.bestSaving!.name);
  if (best && displayComparability(best, today) === "like_for_like") {
    return `Freight per shipment: up to ${percent(c.bestSaving!.pct)} below what you pay today`;
  }
  const like = c.options.filter((o) => displayComparability(o, today) === "like_for_like" && o.costUsd != null);
  if (c.today.costUsd != null && like.length > 0) return "None of these quotes is below what you pay today yet";
  const cheapest = [...like].sort((a, b) => a.costUsd! - b.costUsd!)[0];
  return cheapest ? `${cheapest.name} has the lowest like-for-like quote` : "Freight quotes on your shortlist";
}

export function forwarderCostCaption(c: ForwarderPayload["comparison"]): string {
  const parts = ["US dollars per shipment. Shorter bars are cheaper."];
  if (c.today.costUsd != null) parts.push("The dashed line is what you pay today.");
  parts.push(
    `Showing your shortlist: ${plural(c.options.length, "option")} of ${plural(c.counts.likeForLike, "like-for-like quote")}.`,
  );
  if (c.options.some((o) => o.comparability !== "like_for_like")) {
    parts.push("Greyed bars aren't directly comparable (different delivery terms, or expired) and are never counted as best.");
  }
  return parts.join(" ");
}

export function forwarderEmptyCost(c: ForwarderPayload["comparison"]): string | null {
  if (c.emptyCost === "only_different_terms") {
    return "The quotes so far use different delivery terms, so they can't be compared fairly yet.";
  }
  if (c.emptyCost === "no_shortlist") {
    return `We have ${plural(c.counts.likeForLike, "like-for-like quote")} and are comparing them. The comparison appears here once we've drawn up your shortlist.`;
  }
  if (c.emptyCost === "too_few") {
    return `We've received ${plural(c.counts.likeForLike, "like-for-like quote")} so far. The comparison appears once we have at least 2.`;
  }
  return null;
}

export const NO_BASELINE_NOTE = "Share your current freight cost with us to see savings.";

export function fcrText(c: ForwarderPayload["comparison"]): { title: string; caption: string } | { empty: string } {
  if (c.fcrIssue === "missing") return { empty: "Shown once your invoice value is confirmed." };
  if (c.fcrIssue === "not_usd") return { empty: "Shown once your invoice value is confirmed in US dollars." };
  const best = c.options.find((o) => o.role === "recommended" && o.fcrPct) ?? c.options.find((o) => o.fcrPct);
  if (c.today.fcrPct && best?.fcrPct) {
    return {
      title: `${c.today.fcrPct} → ${best.fcrPct}`,
      caption: `For every $100 of goods you ship, freight costs $${c.today.fcrPct.replace("%", "")} today, and $${best.fcrPct.replace("%", "")} with ${best.name}.`,
    };
  }
  if (c.today.fcrPct) return { title: c.today.fcrPct, caption: `For every $100 of goods you ship, freight costs $${c.today.fcrPct.replace("%", "")} today.` };
  return { empty: "Shown once we have a comparable quote." };
}

// ---- Lead time ------------------------------------------------------------------

export function leadTimeTitle(c: ForwarderPayload["comparison"]): string {
  const rows = c.options.filter((o) => o.leadMaxDays != null || o.leadMinDays != null);
  const slowest = (o: ForwarderOption) => o.leadMaxDays ?? o.leadMinDays!;
  if (c.today.leadTimeDays != null && rows.length > 0 && rows.every((o) => slowest(o) < c.today.leadTimeDays!)) {
    return "Transit time: every option is faster than today";
  }
  const fastest = [...rows].sort((a, b) => slowest(a) - slowest(b))[0];
  return fastest ? `Transit time: ${fastest.name} is the fastest` : "Transit time";
}

export function leadTimeCaption(c: ForwarderPayload["comparison"]): string {
  const parts = ["Days, door to door. Shorter is faster. Each range is the forwarder's own estimate."];
  if (c.today.leadTimeDays != null) parts.push(`The dashed line is today (${c.today.leadTimeDays} days).`);
  if (c.targetLeadTimeDays != null) parts.push(`The dotted line is your target (${c.targetLeadTimeDays} days).`);
  return parts.join(" ");
}

// ---- Validity -------------------------------------------------------------------

export function validityText(
  c: ForwarderPayload["comparison"],
  today: string,
): { text: string; tone: "ok" | "soon" | "expired" } | null {
  const dates = c.options.map((o) => o.validUntil).filter((d): d is string => d != null);
  if (dates.length === 0) return null;
  const current = dates.filter((d) => daysBetween(today, d) >= 0).sort();
  if (current.length === 0) return { text: "These quotes have expired. We're re-confirming prices.", tone: "expired" };
  const earliest = current[0];
  const left = daysBetween(today, earliest);
  const when = `${formatDateOnly(earliest, today)} (${left === 0 ? "today is the last day" : `${plural(left, "day")} left`})`;
  const some = current.length < dates.length ? " Some quotes have already expired; we're re-confirming them." : "";
  if (left <= VALIDITY_WARNING_DAYS) {
    return { text: `Quotes valid until ${when}. Prices may change after that.${some}`, tone: "soon" };
  }
  return { text: `Quotes valid until ${when}.${some}`, tone: some ? "soon" : "ok" };
}

// ---- 3PL cost --------------------------------------------------------------------

export const THREE_PL_COST_CAPTION =
  "Compares the rate cards each warehouse quoted with your current warehouse's rates. It isn't a monthly bill: your final cost depends on your volumes.";

export function threePlCostTitle(c: ThreePlPayload["comparison"]): string {
  if (c.bestSaving) return `${c.bestSaving.name}'s rate card is ${percent(c.bestSaving.pct)} below today's`;
  return "None of these rate cards is below today's yet";
}

export function threePlEmptyCost(c: ThreePlPayload["comparison"]): string | null {
  switch (c.emptyCost) {
    case "no_baseline":
      return "Share your current warehouse's rates with us to see how the options compare.";
    case "mixed_currencies":
      return "The rate cards are in different currencies, so we can't compare them fairly yet.";
    case "too_few":
      return `The comparison appears once at least 2 shortlisted warehouses have quoted (${plural(c.quoted, "quote")} in so far).`;
    default:
      return null;
  }
}

// ---- Next step --------------------------------------------------------------------

export function nextStepText(view: Pick<ClientUpdateView, "nextStep" | "nextStepDue">, today: string): string | null {
  if (!view.nextStep) return null;
  return view.nextStepDue ? `${view.nextStep}, by ${formatDateOnly(view.nextStepDue, today)}` : view.nextStep;
}
