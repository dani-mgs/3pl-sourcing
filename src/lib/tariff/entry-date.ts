import { isRealIsoDate } from "@/lib/forwarder/parse-quote-form";
import { formatRateDate } from "@/lib/fx/rate-provenance";

// The expected entry date: the day the goods will enter the US, which is the
// day duty applies. Every date here is a UTC calendar date as YYYY-MM-DD, and
// all arithmetic is done on UTC days, so nothing depends on the machine's or
// the user's time zone. "Calculated on" is the estimate's as_of_date: the
// day it was calculated (todayUtc()).
//
// Past entry dates aren't supported: the base HTS rate comes from the current
// schedule only. Yesterday (UTC) is accepted so a user west of UTC who picks
// their own "today" isn't refused.

// Matches save_duty_estimate: entry_date in [calculated on - 1, calculated on + 366].
export const ENTRY_DATE_DAYS_BEFORE = 1;
export const ENTRY_DATE_DAYS_AHEAD = 366;

const DAY_MS = 86_400_000;

function utcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysUtc(iso: string, days: number): string {
  return new Date(utcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function entryDateBounds(calculatedOn: string): { min: string; max: string } {
  return {
    min: addDaysUtc(calculatedOn, -ENTRY_DATE_DAYS_BEFORE),
    max: addDaysUtc(calculatedOn, ENTRY_DATE_DAYS_AHEAD),
  };
}

export type EntryDateResult = { ok: true; date: string } | { ok: false; error: string };

// A real date inside the bounds, or the message to show.
export function checkEntryDate(value: string, calculatedOn: string): EntryDateResult {
  if (!isRealIsoDate(value)) return { ok: false, error: "Enter the expected entry date as a real date." };
  const { min, max } = entryDateBounds(calculatedOn);
  if (value < min) {
    return {
      ok: false,
      error: `The expected entry date can't be earlier than ${formatRateDate(min)} (yesterday, UTC). Past entry dates aren't supported: base duty rates come from the HTS schedule in force today only, with no history of earlier rates.`,
    };
  }
  if (value > max) {
    return {
      ok: false,
      error: `The expected entry date can't be later than ${formatRateDate(max)} (366 days from today, UTC).`,
    };
  }
  return { ok: true, date: value };
}

// The form's entry date: blank or missing means today (an older open page
// that doesn't send the field); anything else must pass checkEntryDate.
export function parseEntryDate(raw: string, calculatedOn: string): EntryDateResult {
  const value = raw.trim();
  return value === "" ? { ok: true, date: calculatedOn } : checkEntryDate(value, calculatedOn);
}

export type EntryDateDefault = { date: string; from: "today" | "quote_lead_time"; days: number | null };

// Today plus the longest lead time on the quote (days, rounded up). The
// quote stores a min and a max in days (numeric, either may be blank), so
// "28-32 days" is 28 and 32. Missing, zero, negative or non-finite values, or
// a lead time that would land past the 366-day limit, fall back to today.
export function defaultEntryDate(
  today: string,
  leadTimeMinDays: number | null | undefined,
  leadTimeMaxDays: number | null | undefined,
): EntryDateDefault {
  const usable = [leadTimeMinDays, leadTimeMaxDays].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  if (usable.length === 0) return { date: today, from: "today", days: null };
  const days = Math.ceil(Math.max(...usable));
  if (days > ENTRY_DATE_DAYS_AHEAD) return { date: today, from: "today", days: null };
  return { date: addDaysUtc(today, days), from: "quote_lead_time", days };
}

// The US customs fiscal year runs 1 October to 30 September; MPF limits and
// the informal-entry fee are re-set each 1 October.
function fiscalYear(iso: string): number {
  const year = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 10 ? year + 1 : year;
}

// What to say when the entry date is after the day of calculation. Empty
// when the entry date is today or earlier.
export function entryDateCaveats(input: {
  calculatedOn: string;
  entryDate: string;
  releaseLabel: string;
}): string[] {
  const { calculatedOn, entryDate, releaseLabel } = input;
  if (entryDate <= calculatedOn) return [];
  const caveats = [
    `Base duty rate is from the HTS schedule in force today (${releaseLabel}); changes announced later are not included.`,
    "Additional duties and fees are those known today to be in force on the entry date; later changes aren't included.",
  ];
  if (fiscalYear(entryDate) > fiscalYear(calculatedOn)) {
    caveats.push(
      "Customs user fees are re-set each 1 October. The entry date is in the next fiscal year, so the fee amounts shown are those in force today.",
    );
  }
  return caveats;
}
