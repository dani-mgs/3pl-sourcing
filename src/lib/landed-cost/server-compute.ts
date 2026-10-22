import type { createClient } from "@/lib/supabase/server";
import { todayUtc } from "@/lib/fx/server-rates";
import { checkEntryDate, entryDateBounds } from "@/lib/tariff/entry-date";
import type { CallErrorCode, DutyBatchResult, LineDutyResult, LineErrorCode } from "./duty-request";
import { toScenarioSkuDuty } from "./duty-adapter";
import type { FeeRowWithDates } from "./entry-fees";
import { applyRateOverrides, type ManualRateConflict } from "./manual-rates";
import { compareScenarios, type ScenarioComparison } from "./scenario-comparison";
import { dutyLines, prepareScenario, type PreparedScenario, type PreparedSku, type ScenarioField, type SkuField } from "./scenario-inputs";
import { computeScenarioTotals, type ScenarioTotals } from "./scenario-totals";
import { loadSkuDuties } from "./server-duty-batch";
import { readFeeRows } from "./server-duty-reads";
import { loadFirstNames } from "./server-workspace-list";
import { shipmentTotals, type ShipmentTotals, type SkuMeasures } from "./shipment-measures";
import type { SkuDuty } from "./sku-duty";
import type { Workspace } from "./workspace-schema";

// SERVER-ONLY. A workspace's results, calculated from its saved inputs every
// time it's loaded and never stored: per scenario and SKU line, what's still
// missing or the duties; per complete scenario, the landed cost; and the
// comparison of complete scenarios with the baseline. A scenario shows totals
// only when every SKU line is complete: never a partial total. Duties for
// every scenario x SKU line come from ONE loadSkuDuties call; each line's
// manual rates are applied after it (manual-rates.ts), and a manual rate that
// no longer fits blocks that SKU's total. Uses the caller's client (RLS
// applies); the caller checks requireStaff() first.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DutyUnit = { token: string; label: string };

export type SkuStatus =
  | { status: "ok"; skuLineId: string; duty: SkuDuty; measures: SkuMeasures | null }
  // `duty` is set when the duties are known but other inputs are missing.
  | { status: "inputs_missing"; skuLineId: string; missing: SkuField[]; dutyQuantityUnit: DutyUnit | null; duty: SkuDuty | null }
  // `missing` lists any inputs still to enter as well.
  | { status: "duty_error"; skuLineId: string; code: LineErrorCode; message: string; unit: DutyUnit | null; missing: SkuField[] }
  // A manual rate that no longer fits the app's duties (manual-rates.ts):
  // blocking, like a missing input; `missing` lists any inputs still to enter.
  | { status: "manual_rate_conflict"; skuLineId: string; conflicts: ManualRateConflict[]; duty: SkuDuty; missing: SkuField[] };

type Base = { scenarioId: string; label: string; isBaseline: boolean; skus: SkuStatus[] };
export type ScenarioOutcome =
  | (Base & { state: "complete"; shipment: ShipmentTotals | null; totals: ScenarioTotals })
  | (Base & { state: "incomplete"; missing: ScenarioField[] })
  | (Base & { state: "error"; message: string });

export type WorkspaceResult =
  | {
      state: "ready";
      calculatedOn: string;
      entryDate: string;
      scenarios: ScenarioOutcome[];
      comparison: ScenarioComparison | null;
      // Why there is no comparison; null when there is one.
      comparisonNote: string | null;
    }
  | { state: "entry_date_out_of_range"; calculatedOn: string; entryDate: string; bounds: { min: string; max: string }; message: string }
  | { state: "no_sku_lines"; calculatedOn: string; entryDate: string }
  | { state: "duties_unavailable"; calculatedOn: string; entryDate: string; code: CallErrorCode; message: string };

const LOAD_FAILED = "Duties and fees couldn't be loaded right now. Try again.";

// A line's duties after its manual rates, with whether one applies and what blocks it.
type LineDuty = { result: LineDutyResult; includesManualRate: boolean; conflicts: ManualRateConflict[] };

function withOverrides(sku: PreparedSku, result: LineDutyResult | undefined, names: Map<string, string>): LineDuty | undefined {
  if (!result) return undefined;
  const overrides = sku.item?.overrides ?? [];
  if (!result.ok || overrides.length === 0 || sku.enteredValueUsd == null) return { result, includesManualRate: false, conflicts: [] };
  const applied = applyRateOverrides(result.duty, overrides, sku.enteredValueUsd, names);
  return { result: { ...result, duty: applied.duty }, includesManualRate: applied.includesManualRate, conflicts: applied.conflicts };
}

function skuStatus(sku: PreparedSku, line: LineDuty | undefined): SkuStatus {
  const skuLineId = sku.skuLine.id;
  const duty = line?.result;
  if (duty && !duty.ok && duty.code !== "needs_quantity") {
    return { status: "duty_error", skuLineId, code: duty.code, message: duty.message, unit: duty.unit ?? null, missing: sku.missing };
  }
  const needsQuantity = duty && !duty.ok ? duty : null;
  const missing: SkuField[] = needsQuantity ? [...sku.missing, "duty_quantity"] : sku.missing;
  const known = duty?.ok ? duty.duty : null;
  if (known && line && line.conflicts.length > 0) {
    return { status: "manual_rate_conflict", skuLineId, conflicts: line.conflicts, duty: known, missing };
  }
  if (missing.length > 0 || !known) {
    return { status: "inputs_missing", skuLineId, missing, dutyQuantityUnit: needsQuantity?.unit ?? null, duty: known };
  }
  return { status: "ok", skuLineId, duty: known, measures: sku.measures };
}

function scenarioOutcome(
  prepared: PreparedScenario,
  duties: Map<string, LineDuty>,
  feeRows: FeeRowWithDates[],
  entryDate: string,
  baselineId: string | null,
): ScenarioOutcome {
  const { scenario } = prepared;
  const skus = prepared.skus.map((s) => skuStatus(s, duties.get(s.lineId)));
  const base: Base = { scenarioId: scenario.id, label: scenario.label, isBaseline: scenario.id === baselineId, skus };
  if (prepared.error) return { ...base, state: "error", message: prepared.error };
  if (prepared.missing.length > 0 || skus.some((s) => s.status !== "ok")) {
    return { ...base, state: "incomplete", missing: prepared.missing };
  }

  const result = computeScenarioTotals({
    incoterm: scenario.incoterm,
    shipmentMode: scenario.shipmentMode,
    entryTypeChoice: scenario.entryType,
    freightTotalUsd: scenario.freightTotalUsd!,
    freightBasis: scenario.freightBasis,
    skus: prepared.skus.map((s) => {
      const line = duties.get(s.lineId)!;
      const adapted = toScenarioSkuDuty(line.result, line.includesManualRate);
      if (!adapted.ok) throw new Error("unreachable: an ok SKU has an ok duty");
      return {
        skuId: s.skuLine.id,
        quantity: s.skuLine.quantity,
        unitPriceUsd: s.item!.fobUnitPriceUsd!,
        chargeableKg: s.measures?.chargeableKg ?? null,
        ...adapted.fields,
      };
    }),
    otherCosts: scenario.otherCosts.map((c) => ({ label: c.label, amountUsd: c.amountUsd })),
    feeRows,
    entryDate,
  });
  if (!result.ok) return { ...base, state: "error", message: result.error };
  const measures = prepared.skus.map((s) => s.measures);
  const shipment = measures.every((m): m is SkuMeasures => m != null) ? shipmentTotals(measures) : null;
  return { ...base, state: "complete", shipment, totals: result.totals };
}

function comparisonOf(workspace: Workspace, outcomes: ScenarioOutcome[]): { comparison: ScenarioComparison | null; comparisonNote: string | null } {
  const complete = outcomes.filter((o): o is Extract<ScenarioOutcome, { state: "complete" }> => o.state === "complete");
  const baseline = complete.find((o) => o.isBaseline);
  if (!baseline) {
    return { comparison: null, comparisonNote: "The baseline scenario isn't complete yet, so the scenarios can't be compared." };
  }
  const scenarios = new Map(workspace.scenarios.map((s) => [s.id, s]));
  const compared = compareScenarios(
    complete.map((o) => {
      const s = scenarios.get(o.scenarioId)!;
      return { id: s.id, label: s.label, incoterm: s.incoterm, shipmentMode: s.shipmentMode, totals: o.totals };
    }),
    baseline.scenarioId,
  );
  return compared.ok ? { comparison: compared.comparison, comparisonNote: null } : { comparison: null, comparisonNote: compared.error };
}

// The first names of whoever set or changed a manual rate (shown with it).
// Not loading them never blocks the result: the layer says "a staff member".
async function overrideNames(supabase: Supabase, workspace: Workspace): Promise<Map<string, string>> {
  const ids = new Set(
    workspace.scenarios.flatMap((s) => s.items.flatMap((i) => (i.overrides ?? []).flatMap((o) => [o.setBy, o.changedBy]))),
  );
  if (ids.size === 0) return new Map();
  try {
    const names = await loadFirstNames(supabase, [...ids]);
    return new Map([...names].flatMap(([id, name]) => (name ? [[id, name] as const] : [])));
  } catch (error) {
    console.error("computeWorkspaceResult names error:", error);
    return new Map();
  }
}

export async function computeWorkspaceResult(
  supabase: Supabase,
  workspace: Workspace,
  calculatedOn: string = todayUtc(),
): Promise<WorkspaceResult> {
  const entryDate = workspace.entryDate;
  // A saved draft's date ages: past the bounds it must be updated first.
  const entry = checkEntryDate(entryDate, calculatedOn);
  if (!entry.ok) {
    return { state: "entry_date_out_of_range", calculatedOn, entryDate, bounds: entryDateBounds(calculatedOn), message: entry.error };
  }
  if (workspace.skuLines.length === 0) return { state: "no_sku_lines", calculatedOn, entryDate };

  const prepared = workspace.scenarios.map((s) => prepareScenario(workspace.skuLines, s));
  const lines = prepared.flatMap(dutyLines);
  let duties: DutyBatchResult;
  let feeRows: FeeRowWithDates[];
  try {
    [duties, feeRows] = await Promise.all([
      lines.length > 0 ? loadSkuDuties(supabase, { entryDate, lines }, calculatedOn) : Promise.resolve<DutyBatchResult>({ ok: true, entryDate, lines: [] }),
      readFeeRows(supabase),
    ]);
  } catch (error) {
    // Details stay in the server log.
    console.error("computeWorkspaceResult error:", error);
    return { state: "duties_unavailable", calculatedOn, entryDate, code: "load_failed", message: LOAD_FAILED };
  }
  if (!duties.ok) return { state: "duties_unavailable", calculatedOn, entryDate, code: duties.code, message: duties.message };

  const names = await overrideNames(supabase, workspace);
  const results = new Map(duties.lines.map((l) => [l.lineId, l]));
  const byLine = new Map(
    prepared.flatMap((p) => p.skus.flatMap((s) => {
      const line = withOverrides(s, results.get(s.lineId), names);
      return line ? [[s.lineId, line] as const] : [];
    })),
  );
  const scenarios = prepared.map((p) => scenarioOutcome(p, byLine, feeRows, entryDate, workspace.baselineScenarioId));
  return { state: "ready", calculatedOn, entryDate, scenarios, ...comparisonOf(workspace, scenarios) };
}
