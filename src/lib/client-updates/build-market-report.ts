import { buildForwarderCostComparison } from "@/lib/forwarder/cost-comparison";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { projectFacts, representative, type ForwarderSource, type Result } from "./build-forwarder-payload";
import { roundTo, type BuildResult } from "./build-common";
import { isExcludedStatus, isShortlistedForwarder, wasContacted } from "./partners";
import type { ReportInputs } from "./market-report-inputs";
import {
  MARKET_REPORT_VERSION,
  marketReportPayloadSchema,
  REPORT_OUTCOMES,
  type MarketReportPayload,
  type ReportOutcome,
  type ReportPartner,
} from "./market-report-schema";

// Builds a forwarder project's Market Report from live data, the expert's
// form inputs and the project's partner letters. Pure: the loaders read the
// data. Every partner Move contacted appears once:
// - shortlisted partners (and the recommended one) by name;
// - every other partner as its letter, with only the price, lead time,
//   like-for-like flag, outcome, size band, region and "Move's take";
// - partners Move stopped considering (Unfit, Do Not Contact, Withdrawn /
//   No Response) as "Not taken forward" with only the letter, size band and
//   region: no price, lead time or take, and the same outcome whichever it
//   was.
// "Like-for-like" is the same ranking gate as client updates (cost-
// comparison.ts), and not expired on publish day.

export type PlannedPartner = {
  id: string;
  named: boolean;
  outcome: ReportOutcome;
  priceUsd: number | null;
  leadMinDays: number | null;
  leadMaxDays: number | null;
  likeForLike: boolean;
};

const ORDER = Object.fromEntries(REPORT_OUTCOMES.map((o, i) => [o, i])) as Record<ReportOutcome, number>;

// Letters sort D, E, ... Z, AA, AB: shorter first.
function labelKey(label: string | undefined): string {
  return label ? `${label.length}${label}` : "9";
}

// Who appears, with what outcome, in the report's order. Priced groups go
// cheapest first; groups without a price go by letter (existing letters
// first), then by id, which says nothing about a partner.
export function planMarketReport(
  source: ForwarderSource,
  recommendedId: string | null,
  today: string,
  labels: Map<string, string> = new Map(),
): PlannedPartner[] {
  const { project, forwarders } = source;
  const statusById = new Map(forwarders.map((f) => [f.id, f.status]));
  const quotes = source.quotes
    .filter((q) => statusById.has(q.forwarder_id))
    .map((q) => ({ ...q, forwarder_status: statusById.get(q.forwarder_id) ?? null }));
  const { results } = buildForwarderCostComparison(project, quotes);
  const byForwarder = new Map<string, Result[]>();
  for (const r of results) {
    const list = byForwarder.get(r.quote.forwarder_id) ?? [];
    list.push(r);
    byForwarder.set(r.quote.forwarder_id, list);
  }
  const reps = new Map(forwarders.map((f) => [f.id, representative(byForwarder.get(f.id) ?? [], project, today)]));
  const pricedIds = new Set(forwarders.filter((f) => reps.get(f.id) != null).map((f) => f.id));
  const shortlist = new Set(forwarders.filter(isShortlistedForwarder).map((f) => f.id));

  const planned = forwarders
    .filter((f) => wasContacted(f.status, f.id, pricedIds))
    .map((f): PlannedPartner => {
      if (isExcludedStatus(f.status)) {
        return { id: f.id, named: false, outcome: "not_taken_forward", priceUsd: null, leadMinDays: null, leadMaxDays: null, likeForLike: false };
      }
      const rep = reps.get(f.id) ?? null;
      const r = rep?.result ?? null;
      const named = shortlist.has(f.id);
      const outcome: ReportOutcome = named
        ? f.id === recommendedId
          ? "recommended"
          : "shortlisted"
        : rep == null
          ? "didnt_quote"
          : rep.comparability === "like_for_like"
            ? "quoted_not_selected"
            : rep.comparability === "expired"
              ? "quote_expired"
              : "different_terms";
      return {
        id: f.id,
        named,
        outcome,
        priceUsd: r?.freightCostUsd != null ? roundTo(r.freightCostUsd, 2) : null,
        leadMinDays: r?.quote.lead_time_min_days ?? null,
        leadMaxDays: r?.quote.lead_time_max_days ?? null,
        likeForLike: rep?.comparability === "like_for_like",
      };
    });

  return planned.sort(
    (a, b) =>
      ORDER[a.outcome] - ORDER[b.outcome] ||
      (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity) ||
      labelKey(labels.get(a.id)).localeCompare(labelKey(labels.get(b.id))) ||
      a.id.localeCompare(b.id),
  );
}

// The partners that need a letter, in the order letters are given.
export function anonymisedOrder(planned: PlannedPartner[]): string[] {
  return planned.filter((p) => !p.named).map((p) => p.id);
}

export const REPORT_NOT_SHORTLISTED =
  "Only a shortlisted partner can be recommended. Reload the page and choose again.";

export function buildMarketReport(
  source: ForwarderSource,
  inputs: ReportInputs,
  labels: Map<string, string>,
  people: { authorFirstName: string | null },
  today: string,
): BuildResult<MarketReportPayload> {
  const shortlist = new Set(source.forwarders.filter(isShortlistedForwarder).map((f) => f.id));
  if (inputs.recommendedId && !shortlist.has(inputs.recommendedId)) return { ok: false, error: REPORT_NOT_SHORTLISTED };

  const planned = planMarketReport(source, inputs.recommendedId, today, labels);
  const nameOf = new Map(source.forwarders.map((f) => [f.id, f.company_name]));
  const partners: ReportPartner[] = [];
  for (const p of planned) {
    const input = inputs.partners[p.id] ?? { size: null, region: null, take: null };
    if (p.outcome === "not_taken_forward") {
      partners.push({ label: `Partner ${labels.get(p.id)}`, outcome: p.outcome, size: input.size, region: input.region });
      continue;
    }
    const figures = {
      priceUsd: p.priceUsd,
      leadMinDays: p.leadMinDays,
      leadMaxDays: p.leadMaxDays,
      likeForLike: p.likeForLike,
      size: input.size,
      region: input.region,
      take: input.take,
    };
    if (p.named) {
      partners.push({ name: nameOf.get(p.id)!.trim().slice(0, 120), outcome: p.outcome as "recommended" | "shortlisted", ...figures });
    } else {
      const label = labels.get(p.id);
      if (!label) return { ok: false, error: "A partner is missing its letter. Preview again." };
      partners.push({ label: `Partner ${label}`, outcome: p.outcome as "quoted_not_selected", ...figures });
    }
  }

  const first = people.authorFirstName?.trim().split(/\s+/)[0] ?? "";
  const payload: MarketReportPayload = {
    v: MARKET_REPORT_VERSION,
    kind: "market_report",
    project: { route: shortRouteLabel(source.project), facts: projectFacts(source.project) },
    author: { firstName: first === "" ? null : first.slice(0, 60) },
    today: {
      costUsd: source.project.current_freight_cost_usd != null ? roundTo(source.project.current_freight_cost_usd, 2) : null,
    },
    partners,
  };
  const checked = marketReportPayloadSchema.safeParse(payload);
  if (!checked.success) return { ok: false, error: "This Market Report couldn't be prepared. Check the project's figures." };
  return { ok: true, payload: checked.data };
}
