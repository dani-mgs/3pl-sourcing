import { formatRateDate } from "@/lib/fx/rate-provenance";
import { formatCurrency } from "@/lib/currency";
import { NO_REVIEWED_DUTIES_TEXT } from "@/lib/tariff/effective-rate";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { centsToRational } from "@/lib/tariff/rational";
import { usd } from "@/lib/tariff/amount-text";
import { baselineScenario, missingFieldId, scenarioFieldId, skuFieldId, workspaceFieldId } from "./editor-draft";
import { perUnit, shareTenths, tenthsText } from "./money";
import type { ScenarioField, SkuField } from "./scenario-inputs";
import type { Workspace } from "./workspace-schema";
import type { ViewDutyUnit, ViewOutcome, ViewResult, ViewSkuStatus } from "./view-result";

// The result panel's content: the server's result (or a locked version's) for the edited
// scenario, as plain text ready to show (no bigint or Rational reaches the
// browser). Pure. Every status carries a word; colour only repeats it.

export type MissingItem = { label: string; targetId: string | null };

export type DutyLayer = {
  label: string;
  heading: string | null;
  rate: string;
  amount: string;
  detail: string | null;
  sourceLabel: string;
  sourceUrl: string;
  checkedOn: string | null;
  notes: string[];
};

export type SkuResultRow = {
  skuLineId: string;
  skuCode: string;
  htsCode: string;
  status: ViewSkuStatus["status"];
  statusLabel: string;
  // Complete scenario only.
  perUnit: string | null;
  total: string | null;
  // When the duties are known.
  duties: string | null;
  dutyRate: string | null;
  dutiesIncomplete: boolean;
  includesManualRate: boolean;
  layers: DutyLayer[];
  lastVerified: string | null;
  lastVerifiedStale: boolean;
  // A duty error's message.
  message: string | null;
};

export type BreakdownRow = { key: string; label: string; amount: string; perUnit: string; share: string };

type Common = {
  // Per SKU line, the rate's unit when the last result asked for a duty quantity.
  dutyQuantityUnits: Record<string, ViewDutyUnit>;
};

export type ResultView =
  | (Common & {
      state: "complete";
      calculatedOn: string;
      perUnit: string;
      total: string;
      units: string;
      incomplete: boolean;
      // "Includes manual rate": a manual rate applies to a SKU (manual-rates.ts).
      includesManualRate: boolean;
      breakdown: BreakdownRow[];
      // The shown shares don't add up to 100.0% ("Percentages are rounded").
      percentagesRounded: boolean;
      skus: SkuResultRow[];
      feeNotes: string[];
      warnings: string[];
    })
  | (Common & { state: "incomplete"; calculatedOn: string; missing: MissingItem[]; skus: SkuResultRow[]; warnings: string[] })
  | (Common & { state: "error"; calculatedOn: string; message: string; skus: SkuResultRow[] })
  | (Common & { state: "duties_unavailable"; message: string })
  | (Common & { state: "no_sku_lines" })
  | (Common & { state: "no_scenario" })
  | (Common & { state: "entry_date_out_of_range"; message: string; min: string; max: string; targetId: string });

const SKU_FIELD_LABELS: Record<Exclude<SkuField, "duty_quantity">, string> = {
  fob_unit_price_usd: "FOB price per unit (USD)",
  pcs_per_carton: "Pieces per carton",
  carton_length_cm: "Carton length (cm)",
  carton_width_cm: "Carton width (cm)",
  carton_height_cm: "Carton height (cm)",
  carton_gross_kg: "Carton weight (kg)",
};
const SCENARIO_FIELD_LABELS: Record<ScenarioField, string> = { freight_total_usd: "Freight total (USD)" };
const SCENARIO_FIELD_INPUT: Record<ScenarioField, "freightTotalUsd"> = { freight_total_usd: "freightTotalUsd" };

const STATUS_LABELS: Record<ViewSkuStatus["status"], string> = {
  ok: "Complete",
  inputs_missing: "Inputs missing",
  duty_error: "Duty error",
  manual_rate_conflict: "Manual rate to fix",
};

export const INCLUDES_MANUAL_RATE = "Includes manual rate";
export const COVERED_BY_MANUAL_RATE = " (covered by a manual rate)";

// The duty quantity's label in the rate's unit: kg is the goods' net weight.
export function dutyQuantityLabel(unit: ViewDutyUnit): string {
  return unit.token === "kg" ? "Net weight (kg)" : `Quantity (${unit.label})`;
}

const money = (cents: bigint) => usd(centsToRational(cents));

// Each part's share of the total, rounded on its own, half up to 0.1%; a
// part above zero that rounds to 0.0% (under 0.05%) shows "<0.1%". So the
// shares may not add up to 100.0%; `rounded` says when they don't.
export function shares(parts: bigint[]): { texts: string[]; rounded: boolean } {
  const total = parts.reduce((acc, p) => acc + p, BigInt(0));
  const tenths = parts.map((p) => (total > BigInt(0) ? shareTenths(p, total) : BigInt(0)));
  const shown = tenths.reduce((acc, t) => acc + t, BigInt(0));
  return {
    texts: tenths.map((t, i) => (t === BigInt(0) && parts[i] > BigInt(0) ? "<0.1%" : tenthsText(t))),
    rounded: total > BigInt(0) && shown !== BigInt(1000),
  };
}

function skuRows(workspace: Workspace, outcome: ViewOutcome): SkuResultRow[] {
  const lines = new Map(workspace.skuLines.map((l) => [l.id, l]));
  const totals = outcome.state === "complete" ? new Map(outcome.totals.skus.map((t) => [t.skuId, t])) : null;
  return outcome.skus.map((s) => {
    const line = lines.get(s.skuLineId);
    const duty = s.status === "duty_error" ? null : s.duty;
    const t = totals?.get(s.skuLineId);
    return {
      skuLineId: s.skuLineId,
      skuCode: line?.skuCode ?? "",
      htsCode: line ? formatHtsCode(line.htsCode) : "",
      status: s.status,
      statusLabel: STATUS_LABELS[s.status],
      perUnit: t ? money(t.perUnitCents) : null,
      total: t ? money(t.totalCents) : null,
      duties: duty ? formatCurrency(duty.dutiesUsd, "USD") : null,
      dutyRate: duty?.effectiveDutyRate ?? null,
      dutiesIncomplete: duty?.incomplete ?? false,
      includesManualRate: (duty?.lines ?? []).some((l) => l.manual),
      layers: (duty?.lines ?? []).map((l) => ({
        label: l.label,
        heading: l.heading ?? null,
        rate: l.rateText,
        amount: formatCurrency(l.amountUsd, "USD"),
        detail: l.detail,
        sourceLabel: l.sourceLabel,
        sourceUrl: l.sourceUrl,
        checkedOn: l.sourceCheckedOn ? formatRateDate(l.sourceCheckedOn) : null,
        notes: l.notes ?? [],
      })),
      lastVerified: duty ? (duty.oldestReview?.text ?? NO_REVIEWED_DUTIES_TEXT) : null,
      lastVerifiedStale: duty?.oldestReview?.stale ?? false,
      message: s.status === "duty_error" ? s.message : null,
    };
  });
}

// What an incomplete origin still needs, each pointing at its field in that origin.
export function missingItems(workspace: Workspace, outcome: Extract<ViewOutcome, { state: "incomplete" }>): MissingItem[] {
  const codes = new Map(workspace.skuLines.map((l) => [l.id, l.skuCode]));
  const items: MissingItem[] = outcome.missing.map((f) => ({
    label: SCENARIO_FIELD_LABELS[f],
    targetId: scenarioFieldId(outcome.scenarioId, SCENARIO_FIELD_INPUT[f]),
  }));
  for (const s of outcome.skus) {
    const code = codes.get(s.skuLineId) ?? "SKU";
    if (s.status === "duty_error") {
      items.push({ label: `${code}: ${s.message}`, targetId: skuFieldId(s.skuLineId, "htsCode") });
    }
    if (s.status === "manual_rate_conflict") {
      for (const m of s.messages) items.push({ label: `${code}: ${m}`, targetId: null });
    }
    if (s.status === "ok") continue;
    for (const f of s.missing) {
      const label =
        f === "duty_quantity"
          ? s.status === "inputs_missing" && s.dutyQuantityUnit
            ? dutyQuantityLabel(s.dutyQuantityUnit)
            : "Duty quantity"
          : SKU_FIELD_LABELS[f];
      items.push({ label: `${code}: ${label}`, targetId: missingFieldId(outcome.scenarioId, s.skuLineId, f) });
    }
  }
  return items;
}

// Program warnings, once each, then the fees-not-entered note.
function warningsOf(skus: ViewSkuStatus[], feeWarnings: { text: string }[] = []): string[] {
  const seen = new Set<string>();
  for (const s of skus) {
    if (s.status === "duty_error" || !s.duty) continue;
    for (const w of s.duty.warnings) seen.add(`${w.name}: ${w.text}${w.coveredByManualRate ? COVERED_BY_MANUAL_RATE : ""}`);
  }
  for (const w of feeWarnings) seen.add(w.text);
  return [...seen];
}

function feeNotes(outcome: Extract<ViewOutcome, { state: "complete" }>): string[] {
  const fees = outcome.totals.entryFees;
  const entry =
    fees.entryTypeSource === "chosen"
      ? "Formal entry, as chosen for this scenario."
      : fees.entryType === "informal"
        ? "Informal entry, chosen automatically: the entered value is within the informal limit."
        : "Formal entry, chosen automatically: the entered value is above the informal limit.";
  const mpf = `MPF ${fees.mpf.line.rateText}: ${money(fees.mpf.cents)}${fees.mpf.line.detail ? ` (${fees.mpf.line.detail})` : ""}.`;
  const hmf = fees.hmf
    ? `HMF ${fees.hmf.line.rateText}, ocean shipments only: ${money(fees.hmf.cents)}.`
    : "HMF: not charged (ocean shipments only).";
  return [entry, mpf, hmf, "One MPF and one HMF for the whole entry, split across SKUs by entered value."];
}

// One origin's view (the baseline's when `scenarioId` is left out).
export function toResultView(result: ViewResult | null, workspace: Workspace, scenarioId?: string): ResultView {
  const scenario = scenarioId ? workspace.scenarios.find((s) => s.id === scenarioId) : baselineScenario(workspace);
  const dutyQuantityUnits: Record<string, ViewDutyUnit> = {};
  const common = { dutyQuantityUnits };
  if (!scenario || !result) return { ...common, state: "no_scenario" };

  switch (result.state) {
    case "entry_date_out_of_range":
      return {
        ...common,
        state: "entry_date_out_of_range",
        message: result.message,
        min: formatRateDate(result.bounds.min),
        max: formatRateDate(result.bounds.max),
        targetId: workspaceFieldId("entryDate"),
      };
    case "no_sku_lines":
      return { ...common, state: "no_sku_lines" };
    case "duties_unavailable":
      return { ...common, state: "duties_unavailable", message: result.message };
  }

  const outcome = result.scenarios.find((o) => o.scenarioId === scenario.id);
  if (!outcome) return { ...common, state: "no_scenario" };
  for (const s of outcome.skus) {
    if (s.status === "inputs_missing" && s.dutyQuantityUnit) dutyQuantityUnits[s.skuLineId] = s.dutyQuantityUnit;
  }
  const calculatedOn = formatRateDate(result.calculatedOn);
  const skus = skuRows(workspace, outcome);

  if (outcome.state === "error") return { ...common, state: "error", calculatedOn, message: outcome.message, skus };
  if (outcome.state === "incomplete") {
    return { ...common, state: "incomplete", calculatedOn, missing: missingItems(workspace, outcome), skus, warnings: warningsOf(outcome.skus) };
  }

  const t = outcome.totals;
  const sum = (pick: (s: (typeof t.skus)[number]) => bigint) => t.skus.reduce((acc, s) => acc + pick(s), BigInt(0));
  const parts: [string, string, bigint][] = [
    ["product", "Product (FOB)", sum((s) => s.productCents)],
    ["freight", "Freight", sum((s) => s.freightCents)],
    ["duties", "Duties", sum((s) => s.dutiesCents)],
    ["mpf", "MPF", sum((s) => s.mpfCents)],
    ["hmf", "HMF", sum((s) => s.hmfCents)],
    ["other", "Other costs", sum((s) => s.otherCents)],
  ];
  const pct = shares(parts.map((p) => p[2]));
  return {
    ...common,
    state: "complete",
    calculatedOn,
    perUnit: money(t.perUnitCents),
    total: money(t.totalCents),
    units: `${t.units.toLocaleString("en-US")} pcs`,
    incomplete: t.status.incomplete,
    includesManualRate: t.status.includesManualRate,
    breakdown: parts.map(([key, label, cents], i) => ({
      key,
      label,
      amount: money(cents),
      perUnit: money(perUnit(cents, t.units).cents),
      share: pct.texts[i],
    })),
    percentagesRounded: pct.rounded,
    skus,
    feeNotes: feeNotes(outcome),
    warnings: warningsOf(outcome.skus, t.entryFees.warnings),
  };
}

// Every saved origin's view, by scenario id.
export function toResultViews(result: ViewResult | null, workspace: Workspace): Record<string, ResultView> {
  return Object.fromEntries(workspace.scenarios.map((s) => [s.id, toResultView(result, workspace, s.id)]));
}
