import {
  buildForwarderCostComparison,
  effectiveAnnualShipments,
  hasDifferentTerms,
  passesRankingGate,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "@/lib/forwarder/cost-comparison";
import { freightCostRatioText, invoiceRatioIssue, INVOICE_MISSING } from "@/lib/forwarder/freight-cost-ratio";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { daysBetween } from "./dates";
import { allShortlisted, commonParts, NOT_SHORTLISTED, roundTo, type BuildResult, type People } from "./build-common";
import { forwarderFunnel, isExcludedStatus, isShortlistedForwarder, type ForwarderPartner } from "./partners";
import {
  forwarderPayloadSchema,
  PAYLOAD_VERSION,
  type Comparability,
  type ForwarderOption,
  type ForwarderPayload,
} from "./payload-schema";
import { incotermLabel, modeLabel, monthsLabel, shipmentsLabel } from "./plain-words";
import type { PublishInputs } from "./publish-inputs";

// Builds a forwarder project's client-update payload from live data and the
// expert's form inputs. Pure: load-publish-source.ts reads the data. Every
// figure comes from the existing ranking gate (cost-comparison.ts): only a
// quote on the project's agreed terms, from a forwarder still in the
// running, and not expired on publish day is "like-for-like", and only those
// can be "best" or show a saving. Partners are named only if shortlisted.

export type ForwarderProjectSource = ForwarderProjectTerms & {
  origin_city: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_country: string | null;
  project_duration_months: number | null;
  invoice_value: number | null;
  invoice_currency: string | null;
  current_lead_time_days: number | null;
  target_lead_time_days: number | null;
};

export type ForwarderQuoteSource = ForwarderQuoteInput & {
  id: string;
  forwarder_id: string;
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
  rate_valid_until: string | null;
};

export type ForwarderSource = {
  project: ForwarderProjectSource;
  forwarders: ForwarderPartner[];
  quotes: ForwarderQuoteSource[];
};

export type Result = ForwarderQuoteResult<ForwarderQuoteSource>;

export function isExpired(quote: { rate_valid_until: string | null }, today: string): boolean {
  return quote.rate_valid_until != null && daysBetween(today, quote.rate_valid_until) < 0;
}

export function comparabilityOf(result: Result, project: ForwarderProjectTerms, today: string): Comparability {
  if (result.freightCostUsd == null) return "no_price";
  if (passesRankingGate(result.quote, project)) {
    if (isExcludedStatus(result.quote.forwarder_status)) return "not_comparable";
    return isExpired(result.quote, today) ? "expired" : "like_for_like";
  }
  return hasDifferentTerms(result.quote, project) ? "different_terms" : "not_comparable";
}

// The one quote that speaks for a forwarder: its cheapest like-for-like
// quote, else its cheapest priced quote.
export function representative(results: Result[], project: ForwarderProjectTerms, today: string) {
  const priced = results
    .filter((r) => r.freightCostUsd != null)
    .map((r) => ({ result: r, comparability: comparabilityOf(r, project, today) }))
    .sort((a, b) => a.result.freightCostUsd! - b.result.freightCostUsd!);
  return priced.find((p) => p.comparability === "like_for_like") ?? priced[0] ?? null;
}

const ORDER: Record<Comparability, number> = {
  like_for_like: 0,
  expired: 1,
  different_terms: 2,
  not_comparable: 3,
  no_price: 4,
};

// The project's facts in fixed, plain words (mode, terms, volume, length).
export function projectFacts(project: ForwarderProjectSource): string[] {
  const mode = modeLabel(project.final_shipment_mode ?? project.shipment_mode, project.final_shipment_type ?? project.shipment_type);
  const terms = incotermLabel(project.final_incoterm ?? project.current_incoterm);
  return [
    mode,
    terms,
    shipmentsLabel(project.shipments_per_month, project.shipments_per_year),
    monthsLabel(project.project_duration_months, "project"),
  ].filter((f): f is string => f != null);
}

export function buildForwarderPayload(
  source: ForwarderSource,
  inputs: PublishInputs,
  people: People,
  today: string,
): BuildResult<ForwarderPayload> {
  const { project, forwarders } = source;
  const shortlist = forwarders.filter(isShortlistedForwarder);
  if (!allShortlisted(inputs.partnerIds, shortlist)) return { ok: false, error: NOT_SHORTLISTED };

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

  // Counts cover forwarders still in the running.
  const live = forwarders.filter((f) => !isExcludedStatus(f.status));
  const repOf = (id: string) => reps.get(id) ?? null;
  const pricedIds = new Set(forwarders.filter((f) => repOf(f.id) != null).map((f) => f.id));
  const quotedIds = new Set(live.filter((f) => pricedIds.has(f.id)).map((f) => f.id));
  const likeIds = new Set(live.filter((f) => repOf(f.id)?.comparability === "like_for_like").map((f) => f.id));
  const counts = {
    quoted: quotedIds.size,
    likeForLike: likeIds.size,
    differentTerms: live.filter((f) => repOf(f.id)?.comparability === "different_terms").length,
    expired: live.filter((f) => repOf(f.id)?.comparability === "expired").length,
  };

  const baseline = project.current_freight_cost_usd;
  const invoice = { invoice_value: project.invoice_value, invoice_currency: project.invoice_currency };
  const issue = invoiceRatioIssue(invoice.invoice_value, invoice.invoice_currency);
  const fcrIssue = issue == null ? null : issue === INVOICE_MISSING ? ("missing" as const) : ("not_usd" as const);

  const { sections } = inputs;
  const emptyCost = !sections.cost
    ? null
    : counts.likeForLike < 2
      ? counts.likeForLike === 0 && counts.differentTerms > 0
        ? ("only_different_terms" as const)
        : ("too_few" as const)
      : inputs.partnerIds.length === 0
        ? ("no_shortlist" as const)
        : null;
  const showCost = sections.cost && emptyCost == null;
  const showFcr = sections.fcr;

  const nameOf = new Map(forwarders.map((f) => [f.id, f.company_name]));
  const ordered = [
    ...inputs.partnerIds.filter((id) => id === inputs.recommendedId),
    ...inputs.partnerIds.filter((id) => id !== inputs.recommendedId),
  ];
  let options: ForwarderOption[] = ordered.map((id) => {
    const rep = repOf(id);
    const r = rep?.result ?? null;
    const comparability: Comparability = rep?.comparability ?? "no_price";
    const comparable = comparability === "like_for_like";
    const saving = comparable && typeof r?.savingPct === "number" && typeof r.costDifference === "number";
    return {
      name: nameOf.get(id)!,
      role: id === inputs.recommendedId ? "recommended" : "backup",
      comparability,
      costUsd: showCost && r ? roundTo(r.freightCostUsd!, 2) : null,
      savingPct: showCost && saving ? roundTo(r!.savingPct as number, 4) : null,
      savingUsd: showCost && saving ? roundTo(r!.costDifference as number, 2) : null,
      leadMinDays: r?.quote.lead_time_min_days ?? null,
      leadMaxDays: r?.quote.lead_time_max_days ?? null,
      fcrPct: showFcr && fcrIssue == null && r ? freightCostRatioText(r.freightCostUsd, invoice) : null,
      validUntil: r?.quote.rate_valid_until ?? null,
    };
  });
  // Recommended first, then like-for-like cheapest first, then the rest.
  options = [
    ...options.filter((o) => o.role === "recommended"),
    ...options
      .filter((o) => o.role !== "recommended")
      .sort((a, b) => ORDER[a.comparability] - ORDER[b.comparability] || (a.costUsd ?? Infinity) - (b.costUsd ?? Infinity)),
  ];

  const showLeadTime = sections.leadTime && options.some((o) => o.leadMinDays != null || o.leadMaxDays != null);
  const showValidity = sections.validity && options.some((o) => o.validUntil != null);
  options = options.map((o) => ({
    ...o,
    leadMinDays: showLeadTime ? o.leadMinDays : null,
    leadMaxDays: showLeadTime ? o.leadMaxDays : null,
    validUntil: showValidity ? o.validUntil : null,
  }));

  const best = options
    .filter((o) => o.comparability === "like_for_like" && o.savingPct != null && o.savingPct > 0)
    .sort((a, b) => b.savingPct! - a.savingPct!)[0];
  const bestSaving = best ? { name: best.name, pct: best.savingPct!, usd: best.savingUsd! } : null;
  const annualShipments = effectiveAnnualShipments(project);
  const annual =
    inputs.includeAnnual && bestSaving && annualShipments != null && annualShipments > 0
      ? { savingUsd: roundTo(bestSaving.usd * annualShipments, 2), shipmentsPerYear: annualShipments }
      : null;

  const recommendedName = inputs.recommendedId ? (nameOf.get(inputs.recommendedId) ?? null) : null;
  const facts = projectFacts(project);

  const payload: ForwarderPayload = {
    v: PAYLOAD_VERSION,
    kind: "forwarder",
    project: { route: shortRouteLabel(project), facts },
    ...commonParts(inputs, people, recommendedName),
    funnel: sections.funnel ? forwarderFunnel(forwarders, pricedIds, likeIds, recommendedName != null) : null,
    comparison: {
      kind: "forwarder",
      counts,
      show: { cost: showCost, leadTime: showLeadTime, fcr: showFcr, validity: showValidity },
      today: {
        costUsd: showCost && baseline != null ? roundTo(baseline, 2) : null,
        leadTimeDays: showLeadTime ? project.current_lead_time_days : null,
        fcrPct: showFcr && fcrIssue == null ? freightCostRatioText(baseline, invoice) : null,
      },
      targetLeadTimeDays: showLeadTime ? project.target_lead_time_days : null,
      options,
      emptyCost,
      savingsNote: showCost && baseline == null ? "no_baseline" : null,
      fcrIssue: showFcr ? fcrIssue : null,
      bestSaving,
      annual,
    },
  };

  const checked = forwarderPayloadSchema.safeParse(payload);
  if (!checked.success) return { ok: false, error: "This update couldn't be prepared. Check the project's figures." };
  return { ok: true, payload: checked.data };
}
