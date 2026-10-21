import { z } from "zod";
import { NOT_COMPARABLE } from "@/lib/forwarder/cost-comparison";
import type { EstimateLine, ReleaseInfo } from "@/lib/tariff/calculate";
import type { ProgramWarning } from "@/lib/tariff/programs";
import { COMPONENT_KEYS } from "./components";
import type { ScenarioComparison, ScenarioResult } from "./scenario-comparison";
import type { ScenarioOutcome, WorkspaceResult } from "./server-compute";
import type { ViewDuty, ViewOutcome, ViewResult } from "./view-result";
import type { Workspace } from "./workspace-schema";

// A locked version (landed_cost_snapshots): the saved inputs and the result
// calculated from them, stored as JSON when the workspace is locked and never
// recalculated. Money is an exact decimal string ("1734.73", "-233.85"),
// counts are integer strings; no amount is a float. buildSnapshotRow makes
// the row save_landed_cost_snapshot() takes (which re-checks the sums against
// the live workspace); parseSnapshot reads one back through this schema and
// restoreSnapshot turns it into the inputs the result and comparison views
// read (view-result.ts), so a version is shown by the same code as the live
// page. Pure.

export const SNAPSHOT_SCHEMA_VERSION = 1;

const B0 = BigInt(0);
const HUNDRED = BigInt(100);

// ---- Codecs ----

const MONEY = /^-?\d+\.\d{2}$/;
export function centsToMoney(cents: bigint): string {
  const a = cents < B0 ? -cents : cents;
  return `${cents < B0 ? "-" : ""}${a / HUNDRED}.${(a % HUNDRED).toString().padStart(2, "0")}`;
}
export function moneyToCents(money: string): bigint {
  const negative = money.startsWith("-");
  const [whole, frac] = money.replace("-", "").split(".");
  const cents = BigInt(whole) * HUNDRED + BigInt(frac);
  return negative ? -cents : cents;
}
// A line amount is a number rounded to the cent by the calculator.
const usdToMoney = (usd: number) => centsToMoney(BigInt(Math.round(usd * 100)));
const moneyToUsd = (money: string) => Number(moneyToCents(money)) / 100;

// ---- Schema ----

const money = z.string().regex(MONEY);
const count = z.string().regex(/^\d+$/);
const integer = z.string().regex(/^-?\d+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = z.string().nullable();

const lineSchema = z.object({
  kind: z.enum(["duty", "additional", "fee"]),
  code: z.string(),
  label: z.string(),
  rateText: z.string(),
  amountUsd: money,
  detail: nullableText,
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  effectiveFrom: nullableText,
  heading: z.string().optional(),
  effectiveTo: nullableText.optional(),
  legalStatus: z.string().optional(),
  sourceCheckedOn: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

const warningSchema = z.object({
  programKey: z.string(),
  name: z.string(),
  text: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  kind: z.enum(["not_loaded", "pending_review", "depends_on", "exempt_pending", "unconfirmed", "conditional"]).optional(),
  // A rate, not an amount.
  indicativePct: z.number().nullable().optional(),
  hint: nullableText.optional(),
  counted: z.boolean().optional(),
});

const reviewSchema = z.object({
  programKey: z.string(),
  name: z.string(),
  status: z.enum(["not_loaded", "pending_review", "reviewed"]),
  reviewedAt: nullableText,
  reviewedByName: nullableText,
  staleReason: nullableText,
});

const dutySchema = z.object({
  htsCode: z.string().regex(/^\d{8}(\d{2})?$/),
  rateColumn: z.enum(["general", "column2"]),
  rateText: z.string(),
  effectiveDutyRate: nullableText,
  incomplete: z.boolean(),
  dutiesUsd: money,
  lines: z.array(lineSchema),
  warnings: z.array(warningSchema),
  dutyReviews: z.array(reviewSchema),
  oldestReview: z
    .object({ programName: z.string(), reviewedOn: date, days: z.number().int(), stale: z.boolean(), text: z.string() })
    .nullable(),
  scheduledChanges: z.array(
    z.object({
      programKey: z.string(),
      programName: z.string(),
      date,
      kind: z.enum(["starts", "ends"]),
      headings: z.array(z.string()),
      description: z.string(),
    }),
  ),
});

const skuSchema = z.object({
  skuLineId: z.uuid(),
  quantity: count,
  productUsd: money,
  freightUsd: money,
  dutiesUsd: money,
  mpfUsd: money,
  hmfUsd: money,
  otherUsd: money,
  totalUsd: money,
  perUnitUsd: money,
  // The exact per-unit cost in cents, as a fraction.
  perUnitExact: z.object({ n: integer, d: count }),
  duty: dutySchema,
});

const feeSchema = z.object({ usd: money, line: lineSchema });

const originSchema = z.object({
  scenarioId: z.uuid(),
  label: z.string(),
  isBaseline: z.boolean(),
  units: count,
  totalUsd: money,
  perUnitUsd: money,
  status: z.object({ incomplete: z.boolean(), includesManualRate: z.boolean(), unverified: z.boolean() }),
  entryFees: z.object({
    enteredValueUsd: money,
    entryType: z.enum(["formal", "informal"]),
    entryTypeSource: z.enum(["chosen", "automatic"]),
    mpf: feeSchema,
    hmf: feeSchema.nullable(),
    warnings: z.array(z.object({ kind: z.literal("fees_not_entered"), text: z.string(), fiscalYear: z.number().int(), startsOn: date })),
  }),
  otherCosts: z.array(z.object({ label: z.string(), amountUsd: money })),
  skus: z.array(skuSchema).min(1),
});

const comparisonResultSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  isBaseline: z.boolean(),
  totalUsd: money,
  notComparableReasons: z.array(z.string()),
  modeNote: nullableText,
  // False: every field below is null ("Not Comparable").
  comparable: z.boolean(),
  differenceUsd: money.nullable(),
  differencePctText: nullableText,
  perUnitDifferenceUsd: money.nullable(),
  vsBaseline: z.enum(["Below Baseline", "Equal to Baseline", "Above Baseline"]).nullable(),
  drivers: z.array(z.object({ key: z.enum(COMPONENT_KEYS), label: z.string(), differenceUsd: money })).nullable(),
  rank: z.number().int().nullable(),
  rankPosition: z.enum(["Only Comparable Scenario", "Lowest Landed Cost", "Highest Landed Cost"]).nullable(),
});

export const snapshotResultSchema = z.object({
  calculatedOn: date,
  entryDate: date,
  release: z.object({ name: z.string(), title: nullableText, startDate: date.nullable() }),
  origins: z.array(originSchema).min(1),
  comparison: z.object({ baselineId: z.uuid(), caution: z.array(z.string()), results: z.array(comparisonResultSchema) }).nullable(),
  comparisonNote: nullableText,
});

const decimalText = z.string().regex(/^\d+(\.\d+)?$/);
export const snapshotInputsSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  name: z.string(),
  entryDate: date,
  currency: z.literal("USD"),
  baselineScenarioId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  skuLines: z.array(
    z.object({
      id: z.uuid(),
      skuCode: z.string(),
      description: nullableText,
      htsCode: z.string(),
      quantity: count,
      dutyQuantity: z.object({ value: decimalText, unit: z.string() }).nullable(),
    }),
  ),
  scenarios: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      originCountry: z.string(),
      supplierName: nullableText,
      incoterm: z.enum(["EXW", "FCA", "FAS", "FOB"]),
      shipmentMode: z.enum(["Air", "Sea", "Road"]),
      entryType: z.enum(["auto", "formal"]),
      freightTotalUsd: decimalText.nullable(),
      freightBasis: z.enum(["chargeable_weight", "value", "units"]),
      volumetricDivisor: decimalText.nullable(),
      isBaseline: z.boolean(),
      items: z.array(
        z.object({
          skuLineId: z.uuid(),
          fobUnitPriceUsd: decimalText.nullable(),
          pcsPerCarton: decimalText.nullable(),
          cartonLengthCm: decimalText.nullable(),
          cartonWidthCm: decimalText.nullable(),
          cartonHeightCm: decimalText.nullable(),
          cartonGrossKg: decimalText.nullable(),
        }),
      ),
      otherCosts: z.array(z.object({ id: z.uuid(), label: z.string(), amountUsd: decimalText })),
    }),
  ),
});

export type SnapshotResult = z.output<typeof snapshotResultSchema>;
export type SnapshotInputs = z.output<typeof snapshotInputsSchema>;

// ---- Building (at lock time) ----

type Complete = Extract<ScenarioOutcome, { state: "complete" }>;

const lineOut = (l: EstimateLine) => ({
  kind: l.kind,
  code: l.code,
  label: l.label,
  rateText: l.rateText,
  amountUsd: usdToMoney(l.amountUsd),
  detail: l.detail,
  sourceLabel: l.sourceLabel,
  sourceUrl: l.sourceUrl,
  effectiveFrom: l.effectiveFrom,
  ...(l.heading !== undefined && { heading: l.heading }),
  ...(l.effectiveTo !== undefined && { effectiveTo: l.effectiveTo }),
  ...(l.legalStatus !== undefined && { legalStatus: l.legalStatus }),
  ...(l.sourceCheckedOn !== undefined && { sourceCheckedOn: l.sourceCheckedOn }),
  ...(l.notes !== undefined && { notes: l.notes }),
});

function originOut(o: Complete) {
  const t = o.totals;
  const fees = t.entryFees;
  const statuses = new Map(o.skus.map((s) => [s.skuLineId, s]));
  return {
    scenarioId: o.scenarioId,
    label: o.label,
    isBaseline: o.isBaseline,
    units: t.units.toString(),
    totalUsd: centsToMoney(t.totalCents),
    perUnitUsd: centsToMoney(t.perUnitCents),
    status: { ...t.status },
    entryFees: {
      enteredValueUsd: centsToMoney(fees.enteredValueCents),
      entryType: fees.entryType,
      entryTypeSource: fees.entryTypeSource,
      mpf: { usd: centsToMoney(fees.mpf.cents), line: lineOut(fees.mpf.line) },
      hmf: fees.hmf ? { usd: centsToMoney(fees.hmf.cents), line: lineOut(fees.hmf.line) } : null,
      warnings: fees.warnings.map((w) => ({ kind: w.kind, text: w.text, fiscalYear: w.fiscalYear, startsOn: w.startsOn })),
    },
    otherCosts: t.otherCosts.map((c) => ({ label: c.label, amountUsd: centsToMoney(c.amountCents) })),
    skus: t.skus.map((s) => {
      const status = statuses.get(s.skuId);
      if (status?.status !== "ok") throw new Error("A complete origin has a SKU without duties.");
      const d = status.duty;
      return {
        skuLineId: s.skuId,
        quantity: s.quantity.toString(),
        productUsd: centsToMoney(s.productCents),
        freightUsd: centsToMoney(s.freightCents),
        dutiesUsd: centsToMoney(s.dutiesCents),
        mpfUsd: centsToMoney(s.mpfCents),
        hmfUsd: centsToMoney(s.hmfCents),
        otherUsd: centsToMoney(s.otherCents),
        totalUsd: centsToMoney(s.totalCents),
        perUnitUsd: centsToMoney(s.perUnitCents),
        perUnitExact: { n: s.perUnitExactCents.n.toString(), d: s.perUnitExactCents.d.toString() },
        duty: {
          htsCode: d.htsCode,
          rateColumn: d.rateColumn,
          rateText: d.rateText,
          effectiveDutyRate: d.effectiveDutyRate,
          incomplete: d.incomplete,
          dutiesUsd: centsToMoney(d.dutiesCents),
          lines: d.lines.map(lineOut),
          warnings: d.warnings.map((w) => ({ ...w })),
          dutyReviews: d.dutyReviews.map((r) => ({ ...r })),
          oldestReview: d.oldestReview ? { ...d.oldestReview } : null,
          scheduledChanges: d.scheduledChanges.map((c) => ({ ...c })),
        },
      };
    }),
  };
}

function comparisonOut(c: ScenarioComparison) {
  return {
    baselineId: c.baselineId,
    caution: [...c.caution],
    results: c.results.map((r) => {
      const comparable = r.notComparableReasons.length === 0 && Array.isArray(r.drivers);
      const value = <T>(v: T | typeof NOT_COMPARABLE): T | null => (v === NOT_COMPARABLE ? null : (v as T));
      const diff = value(r.differenceCents);
      const perUnitDiff = value(r.perUnitDifferenceCents);
      return {
        id: r.id,
        label: r.label,
        isBaseline: r.isBaseline,
        totalUsd: centsToMoney(r.totalCents),
        notComparableReasons: [...r.notComparableReasons],
        modeNote: r.modeNote,
        comparable,
        differenceUsd: comparable && diff != null ? centsToMoney(diff) : null,
        differencePctText: comparable ? value(r.differencePctText) : null,
        perUnitDifferenceUsd: comparable && perUnitDiff != null ? centsToMoney(perUnitDiff) : null,
        vsBaseline: comparable ? value(r.vsBaseline) : null,
        drivers: comparable && Array.isArray(r.drivers) ? r.drivers.map((d) => ({ key: d.key, label: d.label, differenceUsd: centsToMoney(d.differenceCents) })) : null,
        rank: comparable ? value(r.rank) : null,
        rankPosition: comparable ? (value(r.rankPosition) ?? null) : null,
      };
    }),
  };
}

export type SnapshotRow = {
  workspace_id: string;
  as_of_date: string;
  workspace_name: string;
  entry_date: string;
  workspace_updated_at: string;
  hts_release_name: string;
  hts_release_title: string | null;
  hts_release_start_date: string | null;
  schema_version: number;
  inputs: SnapshotInputs;
  result: SnapshotResult;
  origin_count: number;
  baseline_label: string;
  baseline_per_unit_usd: string;
  incomplete: boolean;
};

// The row to lock, or why it can't be: every origin must be complete, and
// every SKU's duties from one HTS release.
export function buildSnapshotRow(workspace: Workspace, result: WorkspaceResult): { ok: true; row: SnapshotRow } | { ok: false; error: string } {
  if (result.state !== "ready") return { ok: false, error: "The result can't be calculated, so this version can't be locked." };
  const complete = result.scenarios.filter((o): o is Complete => o.state === "complete");
  if (complete.length !== result.scenarios.length || complete.length === 0) {
    return { ok: false, error: "Complete every origin before locking." };
  }
  const releases = new Map<string, ReleaseInfo>();
  for (const o of complete) for (const s of o.skus) if (s.status === "ok") releases.set(s.duty.release.name, s.duty.release);
  if (releases.size !== 1) return { ok: false, error: "The duties weren't all calculated on one HTS release. Reload and try again." };
  const release = [...releases.values()][0];
  const baseline = complete.find((o) => o.isBaseline) ?? complete[0];

  const stored: SnapshotResult = {
    calculatedOn: result.calculatedOn,
    entryDate: result.entryDate,
    release: { name: release.name, title: release.title, startDate: release.release_start_date },
    origins: complete.map(originOut),
    comparison: result.comparison ? comparisonOut(result.comparison) : null,
    comparisonNote: result.comparisonNote,
  };
  const inputs: SnapshotInputs = {
    id: workspace.id,
    ownerId: workspace.ownerId,
    name: workspace.name,
    entryDate: workspace.entryDate,
    currency: workspace.currency,
    baselineScenarioId: workspace.baselineScenarioId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    skuLines: workspace.skuLines.map((l) => ({ ...l, dutyQuantity: l.dutyQuantity ? { ...l.dutyQuantity } : null })),
    scenarios: workspace.scenarios.map((s) => ({
      ...s,
      items: s.items.map((i) => ({ ...i })),
      otherCosts: s.otherCosts.map((c) => ({ ...c })),
    })),
  };
  return {
    ok: true,
    row: {
      workspace_id: workspace.id,
      as_of_date: result.calculatedOn,
      workspace_name: workspace.name,
      entry_date: workspace.entryDate,
      workspace_updated_at: workspace.updatedAt,
      hts_release_name: release.name,
      hts_release_title: release.title,
      hts_release_start_date: release.release_start_date,
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      inputs,
      result: stored,
      origin_count: complete.length,
      baseline_label: baseline.label,
      baseline_per_unit_usd: centsToMoney(baseline.totals.perUnitCents),
      incomplete: complete.some((o) => o.totals.status.incomplete),
    },
  };
}

// ---- Reading back (the version page) ----

export type ParsedSnapshot = { inputs: SnapshotInputs; result: SnapshotResult };

export function parseSnapshot(row: { schema_version: unknown; inputs: unknown; result: unknown }): { ok: true; snapshot: ParsedSnapshot } | { ok: false } {
  if (row.schema_version !== SNAPSHOT_SCHEMA_VERSION) return { ok: false };
  const inputs = snapshotInputsSchema.safeParse(row.inputs);
  const result = snapshotResultSchema.safeParse(row.result);
  if (!inputs.success || !result.success) return { ok: false };
  return { ok: true, snapshot: { inputs: inputs.data, result: result.data } };
}

const lineIn = (l: z.output<typeof lineSchema>): EstimateLine => ({ ...l, amountUsd: moneyToUsd(l.amountUsd) });

function originIn(o: z.output<typeof originSchema>): ViewOutcome {
  const skus = o.skus.map((s) => {
    const duty: ViewDuty = {
      htsCode: s.duty.htsCode,
      dutiesCents: moneyToCents(s.duty.dutiesUsd),
      dutiesUsd: moneyToUsd(s.duty.dutiesUsd),
      effectiveDutyRate: s.duty.effectiveDutyRate,
      incomplete: s.duty.incomplete,
      lines: s.duty.lines.map(lineIn),
      warnings: s.duty.warnings as ProgramWarning[],
      oldestReview: s.duty.oldestReview,
    };
    return { status: "ok" as const, skuLineId: s.skuLineId, duty };
  });
  const fee = (f: z.output<typeof feeSchema>) => ({ cents: moneyToCents(f.usd), line: lineIn(f.line) });
  return {
    state: "complete",
    scenarioId: o.scenarioId,
    label: o.label,
    isBaseline: o.isBaseline,
    skus,
    totals: {
      units: BigInt(o.units),
      totalCents: moneyToCents(o.totalUsd),
      perUnitCents: moneyToCents(o.perUnitUsd),
      status: o.status,
      entryFees: {
        entryType: o.entryFees.entryType,
        entryTypeSource: o.entryFees.entryTypeSource,
        mpf: fee(o.entryFees.mpf),
        hmf: o.entryFees.hmf ? fee(o.entryFees.hmf) : null,
        warnings: o.entryFees.warnings,
      },
      skus: o.skus.map((s) => ({
        skuId: s.skuLineId,
        quantity: BigInt(s.quantity),
        productCents: moneyToCents(s.productUsd),
        freightCents: moneyToCents(s.freightUsd),
        dutiesCents: moneyToCents(s.dutiesUsd),
        mpfCents: moneyToCents(s.mpfUsd),
        hmfCents: moneyToCents(s.hmfUsd),
        otherCents: moneyToCents(s.otherUsd),
        totalCents: moneyToCents(s.totalUsd),
        perUnitCents: moneyToCents(s.perUnitUsd),
        perUnitExactCents: { n: BigInt(s.perUnitExact.n), d: BigInt(s.perUnitExact.d) },
      })),
    },
  };
}

function comparisonIn(c: NonNullable<SnapshotResult["comparison"]>): ScenarioComparison {
  return {
    baselineId: c.baselineId,
    caution: c.caution,
    results: c.results.map((r): ScenarioResult => {
      const shared = {
        id: r.id,
        label: r.label,
        isBaseline: r.isBaseline,
        totalCents: moneyToCents(r.totalUsd),
        notComparableReasons: r.notComparableReasons,
        modeNote: r.modeNote,
      };
      if (!r.comparable) {
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
      return {
        ...shared,
        differenceCents: moneyToCents(r.differenceUsd ?? "0.00"),
        differencePctText: r.differencePctText ?? "—",
        perUnitDifferenceCents: moneyToCents(r.perUnitDifferenceUsd ?? "0.00"),
        vsBaseline: r.vsBaseline ?? "Equal to Baseline",
        drivers: (r.drivers ?? []).map((d) => ({ key: d.key, label: d.label, differenceCents: moneyToCents(d.differenceUsd) })),
        rank: r.rank ?? 1,
        rankPosition: r.rankPosition,
      };
    }),
  };
}

// The stored version as the views' inputs: nothing is recalculated.
export function restoreSnapshot(snapshot: ParsedSnapshot): { workspace: Workspace; result: ViewResult } {
  const { inputs, result } = snapshot;
  return {
    workspace: inputs,
    result: {
      state: "ready",
      calculatedOn: result.calculatedOn,
      entryDate: result.entryDate,
      scenarios: result.origins.map(originIn),
      comparison: result.comparison ? comparisonIn(result.comparison) : null,
      comparisonNote: result.comparisonNote,
    },
  };
}
