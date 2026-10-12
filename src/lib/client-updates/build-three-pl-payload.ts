import { buildCostComparison, totalCost, type CostInputs } from "@/lib/cost-comparison";
import { allShortlisted, commonParts, NOT_SHORTLISTED, roundTo, type BuildResult, type People } from "./build-common";
import { threePlFunnel, threePlShortlist, isExcludedStatus, type ThreePlPartner } from "./partners";
import { PAYLOAD_VERSION, threePlPayloadSchema, type ThreePlOption, type ThreePlPayload } from "./payload-schema";
import { businessModelLabel, monthsLabel, ordersLabel } from "./plain-words";
import type { PublishInputs } from "./publish-inputs";

// Builds a 3PL project's client-update payload. Pure: load-publish-source.ts
// reads the data. A 3PL "total cost" in the app is the sum of the quoted
// unit rates (a rate card), not a monthly bill, so clients only ever see the
// percentage against today's rate card, never amounts, and only when the
// current 3PL (the baseline) has rates and everything is in one currency.

export type ThreePlProjectSource = {
  target_geography: string | null;
  avg_monthly_orders: number | null;
  contract_period_months: number | null;
  client_business_model: string | null;
};

export type ThreePlProviderSource = ThreePlPartner & CostInputs & { location: string | null };

export type ThreePlSource = {
  project: ThreePlProjectSource;
  providers: ThreePlProviderSource[];
  recommendation: {
    priority: string;
    provider_id_1: string | null;
    provider_id_2: string | null;
    provider_id_3: string | null;
  } | null;
};

// The expert's starting point for "Based on", from the saved priority.
export const PRIORITY_BASIS: Record<string, string> = {
  "Cost Savings": "You told us cost matters most.",
  "Quality of Service": "You told us service quality matters most.",
  "Turnaround Time": "You told us speed matters most.",
};

export function threePlShortlistOf(source: ThreePlSource): ThreePlProviderSource[] {
  const rec = source.recommendation;
  return threePlShortlist(source.providers, rec ? [rec.provider_id_1, rec.provider_id_2, rec.provider_id_3] : []) as ThreePlProviderSource[];
}

export function buildThreePlPayload(
  source: ThreePlSource,
  inputs: PublishInputs,
  people: People,
): BuildResult<ThreePlPayload> {
  const shortlist = threePlShortlistOf(source);
  if (!allShortlisted(inputs.partnerIds, shortlist)) return { ok: false, error: NOT_SHORTLISTED };

  const { rows, baselineStatus, mixedCurrencies } = buildCostComparison(source.providers);
  const rowById = new Map(rows.map((r) => [r.provider.id, r]));
  const candidates = source.providers.filter((p) => !p.is_incumbent && p.status !== "Baseline");
  const quotedIds = new Set(candidates.filter((p) => totalCost(p) != null).map((p) => p.id));
  const quoted = candidates.filter((p) => quotedIds.has(p.id) && !isExcludedStatus(p.status)).length;

  const byId = new Map(source.providers.map((p) => [p.id, p]));
  const ordered = [
    ...inputs.partnerIds.filter((id) => id === inputs.recommendedId),
    ...inputs.partnerIds.filter((id) => id !== inputs.recommendedId),
  ];
  const saving = (id: string): number | null => {
    const row = rowById.get(id);
    return row?.savingsState === "value" && row.savings_pct != null ? roundTo(row.savings_pct / 100, 4) : null;
  };

  const { sections } = inputs;
  const withSaving = ordered.filter((id) => saving(id) != null).length;
  const emptyCost = !sections.cost
    ? null
    : baselineStatus !== "Ready"
      ? ("no_baseline" as const)
      : mixedCurrencies
        ? ("mixed_currencies" as const)
        : withSaving < 2
          ? ("too_few" as const)
          : null;
  const showCost = sections.cost && emptyCost == null;

  const options: ThreePlOption[] = ordered.map((id) => {
    const p = byId.get(id)!;
    return {
      name: p.company_name,
      role: id === inputs.recommendedId ? "recommended" : "backup",
      location: p.location?.trim() ? p.location.trim().slice(0, 120) : null,
      savingPct: showCost ? saving(id) : null,
    };
  });

  const best = options.filter((o) => o.savingPct != null && o.savingPct > 0).sort((a, b) => b.savingPct! - a.savingPct!)[0];
  const recommendedName = inputs.recommendedId ? (byId.get(inputs.recommendedId)?.company_name ?? null) : null;
  const { project } = source;
  const facts = [
    businessModelLabel(project.client_business_model),
    ordersLabel(project.avg_monthly_orders),
    monthsLabel(project.contract_period_months, "contract"),
  ].filter((f): f is string => f != null);

  const payload: ThreePlPayload = {
    v: PAYLOAD_VERSION,
    kind: "three_pl",
    project: { route: project.target_geography?.trim() ? project.target_geography.trim().slice(0, 160) : null, facts },
    ...commonParts(inputs, people, recommendedName),
    funnel: sections.funnel ? threePlFunnel(source.providers, quotedIds, shortlist.length, recommendedName != null) : null,
    comparison: {
      kind: "three_pl",
      quoted,
      show: { cost: showCost },
      options,
      emptyCost,
      bestSaving: best ? { name: best.name, pct: best.savingPct! } : null,
    },
  };

  const checked = threePlPayloadSchema.safeParse(payload);
  if (!checked.success) return { ok: false, error: "This update couldn't be prepared. Check the project's figures." };
  return { ok: true, payload: checked.data };
}
