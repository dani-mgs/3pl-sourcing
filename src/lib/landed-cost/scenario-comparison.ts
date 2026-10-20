import { NOT_COMPARABLE, type NotComparable } from "@/lib/forwarder/cost-comparison";
import type { ShipmentMode } from "@/lib/tariff/calculate";
import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from "./components";
import { perUnit, shareTenths, tenthsText } from "./money";
import type { ScenarioTotals } from "./scenario-totals";

// Origin scenarios side by side, on total landed cost. The same rules as the
// forwarder comparison (cost-comparison.ts), on new code: differences are
// baseline − scenario (positive = cheaper than the baseline), compared in
// whole cents; ties rank alike (every tied-lowest is Lowest, every
// tied-highest Highest). A scenario is comparable with the baseline only with
// the same SKUs, the same quantities and the same incoterm; a different
// shipment mode is allowed and reported. Pure.

export { NOT_COMPARABLE };

export type ComparedScenario = {
  id: string;
  label: string;
  incoterm: string;
  shipmentMode: ShipmentMode;
  totals: ScenarioTotals;
};

export type VsBaseline = "Below Baseline" | "Equal to Baseline" | "Above Baseline";
export type RankPosition = "Only Comparable Scenario" | "Lowest Landed Cost" | "Highest Landed Cost";

export type Driver = { key: ComponentKey; label: string; differenceCents: bigint };

export type ScenarioResult = {
  id: string;
  label: string;
  isBaseline: boolean;
  totalCents: bigint;
  // Why it can't be compared with the baseline; empty when it can.
  notComparableReasons: string[];
  // Set when its shipment mode differs from the baseline's (still comparable).
  modeNote: string | null;
  differenceCents: bigint | NotComparable;
  differencePctText: string | NotComparable;
  perUnitDifferenceCents: bigint | NotComparable;
  vsBaseline: VsBaseline | NotComparable;
  drivers: Driver[] | NotComparable;
  rank: number | NotComparable;
  rankPosition: RankPosition | NotComparable | null;
};

export type ScenarioComparison = {
  baselineId: string;
  results: ScenarioResult[];
  // Read the figures with care: a compared scenario is incomplete, uses a
  // manual rate, or has unverified rates.
  caution: string[];
};

export type ComparisonResult = { ok: true; comparison: ScenarioComparison } | { ok: false; error: string };

function quantities(totals: ScenarioTotals): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const sku of totals.skus) map.set(sku.skuId, (map.get(sku.skuId) ?? BigInt(0)) + sku.quantity);
  return map;
}

export function notComparableReasons(scenario: ComparedScenario, baseline: ComparedScenario): string[] {
  const reasons: string[] = [];
  if (scenario.incoterm !== baseline.incoterm) {
    reasons.push(`Incoterm ${scenario.incoterm} differs from the baseline's ${baseline.incoterm}.`);
  }
  const mine = quantities(scenario.totals);
  const theirs = quantities(baseline.totals);
  const ids = [...new Set([...mine.keys(), ...theirs.keys()])];
  const missing = ids.filter((id) => !mine.has(id));
  const extra = ids.filter((id) => !theirs.has(id));
  if (missing.length > 0) reasons.push(`Missing SKUs the baseline has: ${missing.join(", ")}.`);
  if (extra.length > 0) reasons.push(`Has SKUs the baseline doesn't: ${extra.join(", ")}.`);
  const differing = ids.filter((id) => mine.has(id) && theirs.has(id) && mine.get(id) !== theirs.get(id));
  for (const id of differing) {
    reasons.push(`${id}: quantity ${mine.get(id)} differs from the baseline's ${theirs.get(id)}.`);
  }
  return reasons;
}

function cautionFor(scenario: ComparedScenario): string[] {
  const { status } = scenario.totals;
  return [
    status.incomplete ? `${scenario.label}: incomplete (duties or fees not final).` : null,
    status.includesManualRate ? `${scenario.label}: includes a manually entered rate.` : null,
    status.unverified ? `${scenario.label}: includes unverified rates.` : null,
  ].filter((r): r is string => r != null);
}

export function compareScenarios(scenarios: ComparedScenario[], baselineId: string): ComparisonResult {
  const baseline = scenarios.find((s) => s.id === baselineId);
  if (!baseline) return { ok: false, error: "Choose the baseline scenario." };
  const base = baseline.totals;
  const reasonsOf = new Map(scenarios.map((s) => [s.id, s === baseline ? [] : notComparableReasons(s, baseline)]));
  const comparable = scenarios.filter((s) => reasonsOf.get(s.id)!.length === 0);
  const pool = comparable.map((s) => s.totals.totalCents);

  const results = scenarios.map((s): ScenarioResult => {
    const reasons = reasonsOf.get(s.id)!;
    const shared = {
      id: s.id,
      label: s.label,
      isBaseline: s === baseline,
      totalCents: s.totals.totalCents,
      notComparableReasons: reasons,
      modeNote:
        s.shipmentMode !== baseline.shipmentMode
          ? `Ships by ${s.shipmentMode}; the baseline ships by ${baseline.shipmentMode}.`
          : null,
    };
    if (reasons.length > 0) {
      return {
        ...shared,
        differenceCents: NOT_COMPARABLE,
        differencePctText: NOT_COMPARABLE,
        perUnitDifferenceCents: NOT_COMPARABLE,
        vsBaseline: NOT_COMPARABLE,
        drivers: NOT_COMPARABLE,
        rank: NOT_COMPARABLE,
        rankPosition: NOT_COMPARABLE,
      };
    }
    const difference = base.totalCents - s.totals.totalCents;
    const cents = s.totals.totalCents;
    const cheaper = pool.filter((other) => other < cents).length;
    const dearer = pool.filter((other) => other > cents).length;
    const componentCents = (totals: ScenarioTotals, key: ComponentKey) =>
      totals.components.find((c) => c.key === key)!.cents;
    return {
      ...shared,
      differenceCents: difference,
      differencePctText: base.totalCents > BigInt(0) ? tenthsText(shareTenths(difference, base.totalCents)) : "—",
      // Comparable scenarios have the same units, so this is the exact
      // per-unit difference, rounded to the cent once.
      perUnitDifferenceCents: perUnit(difference, base.units).cents,
      vsBaseline: difference > BigInt(0) ? "Below Baseline" : difference === BigInt(0) ? "Equal to Baseline" : "Above Baseline",
      drivers: COMPONENT_KEYS.map((key) => ({
        key,
        label: COMPONENT_LABELS[key],
        differenceCents: componentCents(base, key) - componentCents(s.totals, key),
      })),
      rank: 1 + cheaper,
      rankPosition:
        pool.length === 1
          ? "Only Comparable Scenario"
          : cheaper === 0
            ? "Lowest Landed Cost"
            : dearer === 0
              ? "Highest Landed Cost"
              : null,
    };
  });

  return { ok: true, comparison: { baselineId, results, caution: comparable.flatMap(cautionFor) } };
}
