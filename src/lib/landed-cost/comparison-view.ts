import { usd } from "@/lib/tariff/amount-text";
import { centsToRational } from "@/lib/tariff/rational";
import { COMPONENT_KEYS, type ComponentKey } from "./components";
import { perUnit, shareTenths, tenthsText } from "./money";
import { missingItems } from "./result-view";
import type { ScenarioResult } from "./scenario-comparison";
import type { ScenarioOutcome, WorkspaceResult } from "./server-compute";
import type { Workspace } from "./workspace-schema";

// The comparison of a workspace's origins, from the server's result on the
// last save, as words ready to show. Differences inside compareScenarios are
// baseline minus origin (positive = cheaper than the baseline); here they're
// always written as an amount with "cheaper", "more" or "less", never a sign.
// A percentage is of the origin named after "than" (the baseline when
// compared with the baseline). Pure.

type Complete = Extract<ScenarioOutcome, { state: "complete" }>;

export type ExcludedOrigin = { label: string; reason: string };

export type RankRow = {
  scenarioId: string;
  rank: number;
  label: string;
  isBaseline: boolean;
  perUnit: string;
  total: string;
  // "Lowest landed cost", "Highest landed cost", or null.
  position: string | null;
  // "$2.34/unit more than the baseline (13.5%)", "Same as the baseline", or "Baseline".
  vsBaseline: string;
};

export type Bar = { scenarioId: string; label: string; perUnit: string; widthPct: number; marks: string[] };

export type SkuCell = { text: string; mark: "Lowest" | "Lowest (tie)" | null };
export type SkuCompareTable = {
  columns: { scenarioId: string; label: string; note: "Baseline" | "Not comparable" | null }[];
  rows: { skuCode: string; cells: SkuCell[] }[];
};

export type DriverBlock = {
  scenarioId: string;
  label: string;
  // "In all: $2.34/unit more than the baseline ($233.85 per shipment)."
  summary: string;
  lines: string[];
  // Each line's per-unit amount is rounded on its own.
  roundedNote: boolean;
};

export type ComparisonView =
  | { state: "hidden" }
  | { state: "unavailable"; note: string }
  | { state: "baseline_incomplete"; note: string; excluded: ExcludedOrigin[] }
  | { state: "too_few"; note: string; excluded: ExcludedOrigin[] }
  | {
      state: "ready";
      // Null when no origin besides the baseline can be compared with it.
      verdict: { text: string; perShipment: string } | null;
      noRankingNote: string | null;
      ranking: RankRow[];
      bars: Bar[];
      skuTable: SkuCompareTable;
      drivers: DriverBlock[];
      notComparable: { label: string; reasons: string[] }[];
      excluded: ExcludedOrigin[];
      // "Ranking may change: …"
      caution: string | null;
      // "China by sea, Vietnam by air."
      modes: string | null;
    };

const B0 = BigInt(0);
const money = (cents: bigint) => usd(centsToRational(cents));
const abs = (n: bigint) => (n < B0 ? -n : n);
// Like the breakdown: a non-zero part that rounds to 0.0% shows "<0.1%".
function pctOf(part: bigint, whole: bigint): string {
  if (whole <= B0) return "—";
  const tenths = shareTenths(abs(part), whole);
  return tenths === B0 && part !== B0 ? "<0.1%" : tenthsText(tenths);
}

const DRIVER_NOUNS: Record<ComponentKey, string> = {
  fob: "product",
  freight: "freight",
  duties: "duties",
  fees: "fees (MPF and HMF)",
  other: "other costs",
};

// "China by sea, Vietnam by air."
export function modeLabels(origins: { label: string; mode: string }[]): string | null {
  if (new Set(origins.map((o) => o.mode)).size < 2) return null;
  return `${origins.map((o) => `${o.label} by ${o.mode.toLowerCase()}`).join(", ")}.`;
}

// A non-zero difference per unit, never "$0.00": under half a cent reads "less than $0.01".
function perUnitAmount(amountCents: bigint, units: bigint): string {
  const cents = perUnit(amountCents, units).cents;
  return cents === B0 ? "less than $0.01" : money(cents);
}

// "<cheaper> is $X/unit cheaper than <dearer> (Y%)": the percentage is of the dearer one.
export function verdictText(
  cheaper: { label: string; totalCents: bigint },
  dearer: { label: string; totalCents: bigint },
  units: bigint,
): { text: string; perShipment: string } {
  const difference = dearer.totalCents - cheaper.totalCents;
  if (difference === B0) {
    return {
      text: `${cheaper.label} and ${dearer.label} have the same landed cost (${money(perUnit(cheaper.totalCents, units).cents)}/unit).`,
      perShipment: "Same cost per shipment.",
    };
  }
  return {
    text: `${cheaper.label} is ${perUnitAmount(difference, units)}/unit cheaper than ${dearer.label} (${pctOf(difference, dearer.totalCents)}).`,
    perShipment: `${money(difference)} less per shipment.`,
  };
}

// An origin against the baseline, from its baseline-minus-origin difference.
export function vsBaselineText(differenceCents: bigint, baselineTotalCents: bigint, units: bigint): string {
  if (differenceCents === B0) return "Same as the baseline";
  const word = differenceCents > B0 ? "less" : "more";
  return `${perUnitAmount(abs(differenceCents), units)}/unit ${word} than the baseline (${pctOf(differenceCents, baselineTotalCents)})`;
}

// "$2.00/unit more on product ($200.00 more per shipment)", from baseline minus origin.
export function driverText(key: ComponentKey, differenceCents: bigint, units: bigint): string {
  const noun = DRIVER_NOUNS[key];
  if (differenceCents === B0) return `Same ${noun}`;
  const word = differenceCents > B0 ? "less" : "more";
  const amount = abs(differenceCents);
  return `${perUnitAmount(amount, units)}/unit ${word} on ${noun} (${money(amount)} ${word} per shipment)`;
}

// The cheapest per-unit cost of each SKU among comparable origins; others are never marked.
export function skuCompareTable(
  workspace: Workspace,
  columns: { scenarioId: string; label: string; comparable: boolean; isBaseline: boolean; perUnitBySku: Map<string, bigint> }[],
): SkuCompareTable {
  return {
    columns: columns.map((c) => ({
      scenarioId: c.scenarioId,
      label: c.label,
      note: c.isBaseline ? "Baseline" : c.comparable ? null : "Not comparable",
    })),
    rows: workspace.skuLines.map((line) => {
      const values = columns.map((c) => c.perUnitBySku.get(line.id) ?? null);
      const pool = values.filter((v, i): v is bigint => v != null && columns[i].comparable);
      const lowest = pool.length > 1 ? pool.reduce((a, b) => (b < a ? b : a)) : null;
      const ties = lowest == null ? 0 : pool.filter((v) => v === lowest).length;
      return {
        skuCode: line.skuCode,
        cells: values.map((v, i) => ({
          text: v == null ? "—" : money(v),
          mark: v != null && columns[i].comparable && v === lowest ? (ties > 1 ? "Lowest (tie)" : "Lowest") : null,
        })),
      };
    }),
  };
}

function excludedOf(workspace: Workspace, outcomes: ScenarioOutcome[]): ExcludedOrigin[] {
  return outcomes.flatMap((o) => {
    if (o.state === "complete") return [];
    if (o.state === "error") return [{ label: o.label, reason: o.message }];
    const missing = missingItems(workspace, o).map((m) => m.label);
    return [{ label: o.label, reason: `Missing: ${missing.join("; ")}.` }];
  });
}

// Program names whose duties aren't counted yet in an origin's SKUs.
function uncountedPrograms(outcome: Complete): string[] {
  const names = new Set<string>();
  for (const s of outcome.skus) {
    if (s.status !== "ok") continue;
    for (const w of s.duty.warnings) {
      if (w.kind === "pending_review") names.add(`${w.name} pending review`);
      else if (w.kind === "not_loaded") names.add(`${w.name} not loaded`);
    }
  }
  return [...names];
}

function cautionOf(compared: Complete[], cautions: string[]): string | null {
  const reasons: string[] = [];
  for (const o of compared) {
    const programs = uncountedPrograms(o);
    if (o.totals.status.incomplete) {
      reasons.push(programs.length > 0 ? `${o.label}: ${programs.join(", ")}.` : `${o.label}: duties or fees not final.`);
    }
  }
  // compareScenarios' other reasons (manual or unverified rates).
  for (const c of cautions) if (!/: incomplete \(/.test(c)) reasons.push(c);
  return reasons.length > 0 ? `Ranking may change: ${reasons.join(" ")}` : null;
}

// compareScenarios names SKUs by id; show their codes.
function withCodes(reason: string, workspace: Workspace): string {
  return workspace.skuLines.reduce((text, l) => text.split(l.id).join(l.skuCode), reason);
}

export function toComparisonView(result: WorkspaceResult | null, workspace: Workspace): ComparisonView {
  if (workspace.scenarios.length < 2) return { state: "hidden" };
  if (!result || result.state !== "ready") {
    return { state: "unavailable", note: "Origins can be compared once the result below can be calculated." };
  }
  const outcomes = result.scenarios;
  const excluded = excludedOf(workspace, outcomes);
  const baseline = outcomes.find((o) => o.isBaseline);
  if (!baseline || baseline.state !== "complete") {
    const label = baseline?.label ?? "the baseline";
    return { state: "baseline_incomplete", note: `The baseline (${label}) isn't complete yet, so origins can't be compared.`, excluded };
  }
  const complete = outcomes.filter((o): o is Complete => o.state === "complete");
  if (complete.length < 2) {
    return { state: "too_few", note: "Only one origin is complete. Complete another to compare.", excluded };
  }
  if (!result.comparison) return { state: "unavailable", note: result.comparisonNote ?? "These origins can't be compared." };

  const byId = new Map(result.comparison.results.map((r) => [r.id, r]));
  const modeOf = new Map(workspace.scenarios.map((s) => [s.id, s.shipmentMode as string]));
  const isComparable = (o: Complete) => (byId.get(o.scenarioId)?.notComparableReasons.length ?? 1) === 0;
  const comparable = complete.filter(isComparable);
  const units = baseline.totals.units;

  // Cheapest first; draft order breaks ties, so the baseline isn't favoured.
  const sorted = [...comparable].sort((a, b) => (a.totals.totalCents < b.totals.totalCents ? -1 : a.totals.totalCents > b.totals.totalCents ? 1 : 0));
  let verdict: { text: string; perShipment: string } | null = null;
  if (sorted.length >= 2) {
    const cheapest = sorted[0];
    const other = cheapest.isBaseline ? sorted[1] : baseline;
    verdict = verdictText(
      { label: cheapest.label, totalCents: cheapest.totals.totalCents },
      { label: other.label, totalCents: other.totals.totalCents },
      units,
    );
  }

  const result_ = (o: Complete) => byId.get(o.scenarioId) as ScenarioResult;
  const ranking: RankRow[] =
    sorted.length >= 2
      ? sorted
          .map((o) => {
            const r = result_(o);
            const position = r.rankPosition === "Lowest Landed Cost" ? "Lowest landed cost" : r.rankPosition === "Highest Landed Cost" ? "Highest landed cost" : null;
            return {
              scenarioId: o.scenarioId,
              rank: Number(r.rank),
              label: o.label,
              isBaseline: o.isBaseline,
              perUnit: money(o.totals.perUnitCents),
              total: money(o.totals.totalCents),
              position,
              vsBaseline: o.isBaseline ? "Baseline" : vsBaselineText(r.differenceCents as bigint, baseline.totals.totalCents, units),
            };
          })
          .sort((a, b) => a.rank - b.rank)
      : [];

  const dearest = complete.reduce((m, o) => (o.totals.perUnitCents > m ? o.totals.perUnitCents : m), B0);
  const lowestIds = new Set(ranking.filter((r) => r.position === "Lowest landed cost").map((r) => r.scenarioId));
  const bars: Bar[] = complete.map((o) => ({
    scenarioId: o.scenarioId,
    label: o.label,
    perUnit: money(o.totals.perUnitCents),
    widthPct: dearest > B0 ? Math.max(2, Number((o.totals.perUnitCents * BigInt(100)) / dearest)) : 0,
    marks: [o.isBaseline ? "Baseline" : null, !isComparable(o) ? "Not comparable" : null, lowestIds.has(o.scenarioId) ? "Lowest" : null].filter(
      (m): m is string => m != null,
    ),
  }));

  const skuTable = skuCompareTable(
    workspace,
    complete.map((o) => ({
      scenarioId: o.scenarioId,
      label: o.label,
      comparable: isComparable(o),
      isBaseline: o.isBaseline,
      perUnitBySku: new Map(o.totals.skus.map((s) => [s.skuId, s.perUnitCents])),
    })),
  );

  const drivers: DriverBlock[] = comparable
    .filter((o) => !o.isBaseline)
    .map((o) => {
      const r = result_(o);
      const parts = Array.isArray(r.drivers) ? r.drivers : [];
      const total = r.differenceCents as bigint;
      // Per unit, each rounded on its own (half up on the amount, sign kept).
      const signedPerUnit = (cents: bigint) => (cents < B0 ? -perUnit(-cents, units).cents : perUnit(cents, units).cents);
      const perUnitSum = parts.reduce((acc, d) => acc + signedPerUnit(d.differenceCents), B0);
      const totalPerUnit = signedPerUnit(total);
      const word = total > B0 ? "less" : "more";
      return {
        scenarioId: o.scenarioId,
        label: o.label,
        summary:
          total === B0
            ? "In all: the same as the baseline."
            : `In all: ${perUnitAmount(abs(total), units)}/unit ${word} than the baseline (${money(abs(total))} per shipment).`,
        lines: COMPONENT_KEYS.map((key) => driverText(key, parts.find((d) => d.key === key)?.differenceCents ?? B0, units)),
        roundedNote: perUnitSum !== totalPerUnit,
      };
    });

  return {
    state: "ready",
    verdict,
    noRankingNote: sorted.length < 2 ? "No other origin can be compared with the baseline, so there's no ranking. See why below." : null,
    ranking,
    bars,
    skuTable,
    drivers,
    notComparable: complete
      .filter((o) => !isComparable(o))
      .map((o) => ({ label: o.label, reasons: (byId.get(o.scenarioId)?.notComparableReasons ?? []).map((r) => withCodes(r, workspace)) })),
    excluded,
    caution: cautionOf(comparable, result.comparison.caution),
    modes: modeLabels(comparable.map((o) => ({ label: o.label, mode: modeOf.get(o.scenarioId) ?? "" }))),
  };
}
