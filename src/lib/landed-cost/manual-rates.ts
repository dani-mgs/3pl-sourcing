import { pctText } from "@/lib/tariff/amount-text";
import type { EstimateLine } from "@/lib/tariff/calculate";
import { effectiveRates } from "@/lib/tariff/effective-rate";
import type { ProgramWarning } from "@/lib/tariff/programs";
import { centsToNumber, div, fromInteger, mul, parseDecimal, toCents } from "@/lib/tariff/rational";
import type { SkuDuty } from "./sku-duty";
import type { RateOverride } from "./workspace-schema";

// Manual rates on one SKU line's duties in one origin, applied after the
// app's own (computeSkuDuty). A replace swaps the layer the app applied (the
// base duty, or a program) for the manual value; an add appends a manual
// layer for a duty the app didn't apply. A rate is % of the line's entered
// value, half up to the cent; a fixed amount is used as it is. The duties are
// then the sum of the layers.
//
// A manual rate never makes a result complete: the app's own incomplete
// flag, warnings and "last verified" stay as they were (a warning for a
// program covered by a manual rate is marked, not removed), and the SKU is
// flagged includesManualRate. Two cases block the SKU (no total until the
// manual rate is removed or changed): a replace whose layer the app no longer
// applies, and an add for a program the app now applies itself (it would be
// counted twice). A replace whose app rate changed since it was set gets a
// note. MPF and HMF are never duty layers here (the entry's fees are worked
// out per origin), so they can't be overridden. Pure.

export const BASE_LAYER = "base";

export type ManualLayer = {
  overrideId: string;
  kind: "replace" | "add";
  // What the manual rate is for: "Base duty", the program's name, or the label.
  layerName: string;
  ratePercent: string | null;
  amountUsd: string | null;
  reason: string;
  setByName: string;
  setAt: string;
  changedByName: string;
  changedAt: string;
  // Replace only: the app's own rate and amount for the layer now.
  engineRateText: string | null;
  engineAmountUsd: string | null;
  // "App rate changed from X to Y since this override was set", or null.
  note: string | null;
};

// A duty layer as the result shows it: the app's (manual absent or null) or manual.
export type DutyLine = EstimateLine & { manual?: ManualLayer | null };
export type DutyWarning = ProgramWarning & { coveredByManualRate?: boolean };

// Blocking: the SKU has no total while any is set. `layerName` names the
// layer the manual rate was for (for "Keep as a manual duty").
export type ManualRateConflict = {
  overrideId: string;
  code: "no_longer_matches" | "now_applied";
  layerName: string;
  message: string;
};

export type AppliedDuty = {
  duty: SkuDuty;
  includesManualRate: boolean;
  conflicts: ManualRateConflict[];
};

export const NO_LONGER_MATCHES = "Manual rate no longer matches a duty layer";
export const NOW_APPLIED = "This duty is now applied by the app; remove the manual duty";

const HUNDRED = fromInteger(100);
const lineCents = (l: EstimateLine) => BigInt(Math.round(l.amountUsd * 100));
const moneyText = (cents: bigint) => {
  const a = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`;
};

// The manual amount for the line, in cents.
export function overrideCents(o: Pick<RateOverride, "ratePercent" | "amountUsd">, enteredValueUsd: string): bigint {
  if (o.ratePercent != null) return toCents(div(mul(parseDecimal(enteredValueUsd), parseDecimal(o.ratePercent)), HUNDRED));
  return toCents(parseDecimal(o.amountUsd!));
}

const rateText = (o: RateOverride) => (o.ratePercent != null ? pctText(parseDecimal(o.ratePercent)) : "Fixed amount");

// The engine layer a replace names: "base" or the program's key (null: not one).
export function layerKeyOf(l: DutyLine): string | null {
  if (l.manual) return null;
  return l.kind === "duty" ? BASE_LAYER : l.kind === "additional" ? l.code : null;
}

// The order they're applied and listed in.
export const byOrder = (a: RateOverride, b: RateOverride) =>
  a.sortOrder - b.sortOrder || a.setAt.localeCompare(b.setAt) || a.id.localeCompare(b.id);

const isEngineLayer = (l: DutyLine, key: string) =>
  !l.manual && (key === BASE_LAYER ? l.kind === "duty" : l.kind === "additional" && l.code === key);

// A program's name, as the app named it on this line.
export function programName(duty: Pick<SkuDuty, "dutyReviews" | "warnings">, key: string): string {
  if (key === BASE_LAYER) return "Base duty";
  return (
    duty.dutyReviews.find((r) => r.programKey === key)?.name ??
    duty.warnings.find((w) => w.programKey === key)?.name ??
    key
  );
}

export function applyRateOverrides(
  duty: SkuDuty,
  overrides: RateOverride[],
  enteredValueUsd: string,
  names: Map<string, string>,
): AppliedDuty {
  if (overrides.length === 0) return { duty, includesManualRate: false, conflicts: [] };
  const nameOf = (id: string) => names.get(id) ?? "a staff member";
  const lines: DutyLine[] = [...duty.lines];
  const conflicts: ManualRateConflict[] = [];
  const covered = new Set<string>();
  let applied = 0;

  for (const o of [...overrides].sort(byOrder)) {
    const cents = overrideCents(o, enteredValueUsd);
    const manual = (layerName: string, engine: EstimateLine | null): ManualLayer => ({
      overrideId: o.id,
      kind: o.kind,
      layerName,
      ratePercent: o.ratePercent,
      amountUsd: o.amountUsd,
      reason: o.reason,
      setByName: nameOf(o.setBy),
      setAt: o.setAt,
      changedByName: nameOf(o.changedBy),
      changedAt: o.changedAt,
      engineRateText: engine?.rateText ?? null,
      engineAmountUsd: engine ? moneyText(lineCents(engine)) : null,
      note:
        engine && o.engineRateText != null && engine.rateText !== o.engineRateText
          ? `App rate changed from ${o.engineRateText} to ${engine.rateText} since this override was set`
          : null,
    });

    if (o.kind === "replace") {
      const key = o.layerKey!;
      const name = programName(duty, key);
      const at = lines.findIndex((l) => isEngineLayer(l, key));
      if (at < 0) {
        conflicts.push({ overrideId: o.id, code: "no_longer_matches", layerName: name, message: `${NO_LONGER_MATCHES} (${name}). Remove it or keep it as a manual duty.` });
        continue;
      }
      // The app's label, heading and source stay; the value and amount are manual.
      const engine = lines[at];
      lines[at] = { ...engine, rateText: rateText(o), amountUsd: centsToNumber(cents), manual: manual(name, engine) };
      covered.add(key);
      applied += 1;
      continue;
    }

    const name = o.label!;
    if (o.layerKey != null && lines.some((l) => isEngineLayer(l, o.layerKey!))) {
      conflicts.push({ overrideId: o.id, code: "now_applied", layerName: name, message: `${NOW_APPLIED} (${name}).` });
      continue;
    }
    lines.push({
      kind: "additional",
      code: o.layerKey ?? "manual",
      label: name,
      rateText: rateText(o),
      amountUsd: centsToNumber(cents),
      detail: null,
      sourceLabel: "Manual rate",
      sourceUrl: "",
      effectiveFrom: null,
      manual: manual(name, null),
    });
    if (o.layerKey != null) covered.add(o.layerKey);
    applied += 1;
  }

  const dutiesCents = lines.reduce((acc, l) => acc + lineCents(l), BigInt(0));
  const baseCents = lines.filter((l) => l.kind === "duty").reduce((acc, l) => acc + lineCents(l), BigInt(0));
  const baseDutyUsd = centsToNumber(baseCents);
  const additionalDutiesUsd = centsToNumber(dutiesCents - baseCents);
  const dutiesUsd = centsToNumber(dutiesCents);
  const warnings: DutyWarning[] = duty.warnings.map((w) => (covered.has(w.programKey) ? { ...w, coveredByManualRate: true } : w));
  return {
    duty: {
      ...duty,
      lines,
      warnings,
      baseDutyUsd,
      additionalDutiesUsd,
      dutiesCents,
      dutiesUsd,
      effectiveDutyRate:
        effectiveRates({ customsValueUsd: duty.customsValueUsd, baseDutyUsd, additionalDutiesUsd, totalUsd: dutiesUsd })?.duties ?? null,
    },
    includesManualRate: applied > 0,
    conflicts,
  };
}
