import { formatRateDate } from "@/lib/fx/rate-provenance";
import { addDaysUtc, fiscalYear } from "./entry-date";

// The customs fiscal year rollover on 1 October. MPF (its formal-entry
// limits and the informal flat fee) is re-set each 1 October; HMF is fixed
// by 19 CFR 24.24 and isn't checked. Pure: every date is a UTC calendar date
// (YYYY-MM-DD) passed in, never read from the clock.

export type FeeDateRow = { fee_code: string; effective_from: string; effective_to: string | null };

const ANNUAL_FEES: Record<string, string> = {
  mpf_formal: "MPF (formal entry)",
  mpf_informal: "MPF (informal entry)",
};

export const REMINDER_DAYS_BEFORE = 45;

// The 1 October that starts the fiscal year `date` is in (FY2028 starts on
// 2027-10-01).
export function fiscalYearStart(date: string): string {
  return `${fiscalYear(date) - 1}-10-01`;
}

const inForceOn = (row: FeeDateRow, date: string) =>
  row.effective_from <= date && (row.effective_to == null || row.effective_to >= date);

// The annual fees not yet entered for the fiscal year starting `startsOn`:
// those in force the day before that have no row starting on or after it.
// A fee that wasn't in force the day before (e.g. the first year after
// seeding) is never missing. A new row starting after 1 October counts as
// entered: the old one rightly applies until then.
export function missingFeesFor(fees: FeeDateRow[], startsOn: string): string[] {
  const dayBefore = addDaysUtc(startsOn, -1);
  return Object.entries(ANNUAL_FEES)
    .filter(
      ([code]) =>
        fees.some((r) => r.fee_code === code && inForceOn(r, dayBefore)) &&
        !fees.some((r) => r.fee_code === code && r.effective_from >= startsOn),
    )
    .map(([, name]) => name);
}

export type FeeYearGap = {
  // The fiscal year whose fees are missing, and the day it starts.
  fiscalYear: number;
  startsOn: string;
  missing: string[];
};

export type FeeRolloverReminder = FeeYearGap & { state: "due_soon" | "overdue" };

function gap(fees: FeeDateRow[], startsOn: string): FeeYearGap | null {
  const missing = missingFeesFor(fees, startsOn);
  return missing.length > 0 ? { fiscalYear: fiscalYear(startsOn), startsOn, missing } : null;
}

// Overdue: the current fiscal year started and its fees aren't entered.
// Due soon: the next one starts within 45 days and they aren't entered.
export function feeRolloverReminder(fees: FeeDateRow[], today: string): FeeRolloverReminder | null {
  const current = fiscalYearStart(today);
  const overdue = gap(fees, current);
  if (overdue) return { ...overdue, state: "overdue" };
  const next = `${Number(current.slice(0, 4)) + 1}-10-01`;
  if (today < addDaysUtc(next, -REMINDER_DAYS_BEFORE)) return null;
  const dueSoon = gap(fees, next);
  return dueSoon ? { ...dueSoon, state: "due_soon" } : null;
}

// For an estimate: the fees of the fiscal year the entry date is in aren't
// entered, so last year's would be used.
export function feeYearGap(fees: FeeDateRow[], entryDate: string): FeeYearGap | null {
  return gap(fees, fiscalYearStart(entryDate));
}

// ---- Wording ----------------------------------------------------------------

export function reminderLines(reminder: FeeRolloverReminder, canEditFees: boolean): string[] {
  const fy = reminder.fiscalYear;
  const what = canEditFees
    ? "Check the new rates and add them here; end-date the old rows the day before."
    : "Ask a tariff editor to add them.";
  return [
    ...(reminder.state === "overdue"
      ? [`FY${fy} started on ${formatRateDate(reminder.startsOn)} and its MPF rates aren't entered: estimates for entry from that day use FY${fy - 1}'s.`]
      : []),
    `MPF rates for FY${fy} start on 1 October. ${what}`,
    `Not entered yet: ${reminder.missing.join(", ")}.`,
  ];
}

export function overviewNote(reminder: FeeRolloverReminder): string {
  return reminder.state === "overdue"
    ? `Customs fees: MPF rates for FY${reminder.fiscalYear} started on ${formatRateDate(reminder.startsOn)} and aren't entered yet.`
    : `Customs fees: MPF rates for FY${reminder.fiscalYear} start on 1 October and aren't entered yet.`;
}

export function estimateFeeNote(gapInfo: FeeYearGap): string {
  return `Not final: MPF fees for FY${gapInfo.fiscalYear} (from ${formatRateDate(gapInfo.startsOn)}) aren't entered yet; FY${gapInfo.fiscalYear - 1}'s are used.`;
}

export function shortFeeLabel(fy: number): string {
  return `FY${fy} MPF fees not entered`;
}
