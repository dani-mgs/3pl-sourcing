import { evaluateAdditionalDuties, type DutyReviewNote, type DutyRow, type ProgramReview } from "@/lib/tariff/additional-duties";
import { calculateBaseDuty, type EstimateLine, type ReleaseInfo } from "@/lib/tariff/calculate";
import { effectiveRates, oldestReview, type OldestReview } from "@/lib/tariff/effective-rate";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import type { HtsLineRecord } from "@/lib/tariff/hts-line-match";
import { isIncompleteEstimate, type DutyProgramRow, type ProgramWarning } from "@/lib/tariff/programs";
import { centsToNumber, parseDecimal, toCents, type Rational } from "@/lib/tariff/rational";
import { parseRateText, unitLabelOf } from "@/lib/tariff/rate-text";
import { scheduledChanges, type ScheduledChange } from "@/lib/tariff/scheduled-changes";
import type { LineError } from "./duty-request";

// One SKU line's duties for one origin: the Tariff Calculator's base duty
// (calculateBaseDuty) and additional duties (evaluateAdditionalDuties), in the
// same order and with the same inputs as buildEstimate, but no fees (Landed
// Cost works them out per entry). Pure: the shared data is loaded once for
// the whole batch.

export type SkuDuty = {
  htsCode: string;
  matchedTenDigit: boolean;
  description: string;
  release: ReleaseInfo;
  rateColumn: "general" | "column2";
  rateText: string;
  quantityUsed: { value: number; unit: string; unitLabel: string } | null;
  customsValueUsd: number;
  baseDutyUsd: number;
  additionalDutiesUsd: number;
  dutiesCents: bigint;
  dutiesUsd: number;
  // Base duty, then additional duties.
  lines: EstimateLine[];
  warnings: ProgramWarning[];
  dutyReviews: DutyReviewNote[];
  incomplete: boolean;
  oldestReview: OldestReview | null;
  scheduledChanges: ScheduledChange[];
  // Duties as a share of the value, e.g. "40.9%"; null without a value.
  effectiveDutyRate: string | null;
};

export type SkuDutyInput = {
  lineId: string;
  line: HtsLineRecord;
  matchedTenDigit: boolean;
  release: ReleaseInfo;
  originCountry: string;
  originIsColumn2: boolean;
  customsValueUsd: Rational;
  // In the unit the request gave; checked against the rate's unit.
  quantity: { value: string; unit: string } | null;
  programs: DutyProgramRow[];
  dutyData: { rows: DutyRow[]; reviews: ProgramReview[]; schedule: DutyRow[] };
  asOfDate: string;
  entryDate: string;
};

export type SkuDutyResult = { ok: true; lineId: string; duty: SkuDuty } | LineError;

// The quantity to use: null when the rate has no per-unit part; an error when
// it has one and the request's quantity isn't in that unit. Pieces are never
// read as dozens, and nothing is derived from carton weights.
function quantityFor(input: SkuDutyInput, rateText: string | null): Rational | null | LineError {
  const parsed = parseRateText(rateText);
  if (parsed.kind !== "rate" || !parsed.specific) return input.quantity ? parseDecimal(input.quantity.value) : null;
  const { unit, unitLabel } = parsed.specific;
  if (input.quantity && unitLabelOf(input.quantity.unit) === unitLabel) return parseDecimal(input.quantity.value);
  return {
    ok: false,
    lineId: input.lineId,
    code: "needs_quantity",
    message: `The rate for ${formatHtsCode(input.line.hts_code)} is charged per unit. Enter the quantity in ${unitLabel}.`,
    unit: { token: unit, label: unitLabel },
  };
}

export function computeSkuDuty(input: SkuDutyInput): SkuDutyResult {
  const { line, lineId } = input;
  const code = formatHtsCode(line.hts_code);
  const quantity = quantityFor(input, input.originIsColumn2 ? line.other_rate : line.general_rate);
  if (quantity && "ok" in quantity) return quantity;

  const base = calculateBaseDuty({
    line,
    release: input.release,
    originIsColumn2: input.originIsColumn2,
    customsValueUsd: input.customsValueUsd,
    quantity,
  });
  if (!base.ok) {
    switch (base.reason) {
      case "no_rate":
        return { ok: false, lineId, code: "no_rate", message: `${code} has no rate of duty in the current HTS. Check the code with your customs broker.` };
      case "unsupported_rate":
        return {
          ok: false,
          lineId,
          code: "unsupported_rate",
          message: `The rate for ${code} ("${base.rateText}") depends on details this calculator can't evaluate, such as content weight or component values. Ask your customs broker for this one.`,
        };
      case "quantity_required":
        return { ok: false, lineId, code: "needs_quantity", message: `The rate for ${code} is charged per unit. Enter the quantity in ${base.unitLabel}.` };
    }
  }

  const baseDutyUsd = centsToNumber(base.cents);
  const additional = evaluateAdditionalDuties({
    programs: input.programs,
    rows: input.dutyData.rows,
    reviews: input.dutyData.reviews,
    originCountry: input.originCountry,
    htsCode: line.hts_code,
    customsValueUsd: input.customsValueUsd,
    baseDutyUsd: parseDecimal(baseDutyUsd),
    asOfDate: input.asOfDate,
    entryDate: input.entryDate,
  });
  const dutiesCents = base.cents + toCents(parseDecimal(additional.additionalDutiesUsd));
  const lines = [base.line, ...additional.lines];
  const customsValueUsd = centsToNumber(toCents(input.customsValueUsd));
  const dutiesUsd = centsToNumber(dutiesCents);
  return {
    ok: true,
    lineId,
    duty: {
      htsCode: line.hts_code,
      matchedTenDigit: input.matchedTenDigit,
      description: line.description,
      release: input.release,
      rateColumn: base.rateColumn,
      rateText: base.rateText,
      quantityUsed: base.quantityUsed,
      customsValueUsd,
      baseDutyUsd,
      additionalDutiesUsd: additional.additionalDutiesUsd,
      dutiesCents,
      dutiesUsd,
      lines,
      warnings: additional.warnings,
      dutyReviews: additional.dutyReviews,
      incomplete: isIncompleteEstimate(additional.warnings),
      oldestReview: oldestReview({ dutyReviews: additional.dutyReviews, lines, asOfDate: input.asOfDate }),
      scheduledChanges: scheduledChanges({
        rows: input.dutyData.schedule,
        reviewedPrograms: new Map(additional.dutyReviews.filter((r) => r.status === "reviewed").map((r) => [r.programKey, r.name])),
        originCountry: input.originCountry,
        htsCode: line.hts_code,
        entryDate: input.entryDate,
      }),
      effectiveDutyRate:
        effectiveRates({ customsValueUsd, baseDutyUsd, additionalDutiesUsd: additional.additionalDutiesUsd, totalUsd: dutiesUsd })?.duties ?? null,
    },
  };
}
