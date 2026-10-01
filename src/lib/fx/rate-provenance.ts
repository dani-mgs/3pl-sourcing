// Where a quote's exchange rate came from, and the rules for choosing,
// labelling, and verifying it. Pure functions; the quote form, the save
// actions, the tables, and the exports all use these so they agree.

export const RATE_SOURCES = [
  "daily_feed",
  "forwarder_document",
  "manual",
  "manual_legacy",
] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

// What people see. Internal codes never reach the UI or an export.
export const RATE_SOURCE_LABELS: Record<RateSource, string> = {
  daily_feed: "Daily reference rate",
  forwarder_document: "Forwarder's quoted rate",
  manual: "Entered manually",
  manual_legacy: "Entered manually (date not recorded)",
};

// Shown wherever daily-feed rates are used or exported.
export const DAILY_FEED_ATTRIBUTION =
  "Daily reference rates: Frankfurter (frankfurter.dev), blended from central-bank reference rates.";

// A daily rate older than this many business days gets a stale warning.
export const STALE_AFTER_BUSINESS_DAYS = 3;

export type LatestRate = { rateToUsd: number; rateDate: string };
export type LatestRates = Partial<Record<string, LatestRate>>;

export type RateState = {
  // As typed in the form; "" means no rate yet.
  rate: string;
  source: RateSource | null;
  date: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isUsd(currency: string | null | undefined): boolean {
  return !currency || currency === "USD";
}

// The rate a non-USD quote starts with: a rate stated in the forwarder's
// document, else the latest daily rate (pre-filled, editable), else blank for
// the user to enter. Never 1, never guessed.
export function resolveInitialRate({
  currency,
  documentRate,
  documentDate,
  latest,
  today,
}: {
  currency: string | null | undefined;
  documentRate?: number | null;
  documentDate?: string | null;
  latest: LatestRates;
  today: string;
}): RateState {
  if (isUsd(currency)) return { rate: "1", source: null, date: null };
  if (documentRate != null && documentRate > 0) {
    return {
      rate: String(documentRate),
      source: "forwarder_document",
      date: documentDate && ISO_DATE.test(documentDate) ? documentDate : today,
    };
  }
  const daily = latest[currency!];
  if (daily) return { rate: String(daily.rateToUsd), source: "daily_feed", date: daily.rateDate };
  return { rate: "", source: "manual", date: today };
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// Weekdays after `from`, up to and including `to`. Weekends don't count, so a
// Friday rate is 1 business day old on Monday. Holidays aren't modelled; the
// 3-day threshold leaves room for one.
export function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = dayNumber(from) + 1; day <= dayNumber(to); day++) {
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function isRateStale(rateDate: string, today: string): boolean {
  return businessDaysBetween(rateDate, today) > STALE_AFTER_BUSINESS_DAYS;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatRateDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

const rateFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 });

// "1 KRW = 0.00073811 USD"
export function formatRate(currency: string, rateToUsd: number): string {
  return `1 ${currency} = ${rateFormat.format(rateToUsd)} USD`;
}

// "1 KRW = 0.00073811 USD · as of Oct 1, 2026 · Daily reference rate"
export function rateCaption(
  currency: string,
  rateToUsd: number,
  source: RateSource,
  date: string | null,
): string {
  const parts = [formatRate(currency, rateToUsd)];
  if (date && source !== "manual_legacy") parts.push(`as of ${formatRateDate(date)}`);
  parts.push(RATE_SOURCE_LABELS[source]);
  return parts.join(" · ");
}

// The short note beside a converted USD amount: "rate locked Oct 1, 2026".
// Null for USD quotes, which aren't converted.
export function rateLockedNote(
  currency: string | null | undefined,
  source: RateSource | null | undefined,
  date: string | null | undefined,
): { text: string; title: string } | null {
  if (isUsd(currency) || !source) return null;
  if (source === "manual_legacy" || !date) {
    return { text: RATE_SOURCE_LABELS.manual_legacy, title: RATE_SOURCE_LABELS.manual_legacy };
  }
  return { text: `rate locked ${formatRateDate(date)}`, title: RATE_SOURCE_LABELS[source] };
}

// Same rate at the database's 10-decimal precision.
function sameRate(a: number, b: number): boolean {
  return Math.round(a * 1e10) === Math.round(b * 1e10);
}

export type SavedRate = {
  original_currency: string;
  exchange_rate_to_usd: number;
  exchange_rate_source: RateSource | null;
  exchange_rate_date: string | null;
};

// Server-side decision of the source and date to store, whatever the form
// claimed. A "daily_feed" claim must match the stored feed rate for that date
// exactly, or it's saved as entered manually today; an unchanged rate on an
// edited quote keeps its original provenance (including legacy); anything
// else the form can't prove is manual, dated today.
export async function verifyRateProvenance(
  posted: SavedRate,
  existing: SavedRate | null,
  today: string,
  lookupFeedRate: (currency: string, rateDate: string) => Promise<number | null>,
): Promise<{ source: RateSource | null; date: string | null }> {
  const currency = posted.original_currency;
  if (isUsd(currency)) return { source: null, date: null };

  const manualToday = { source: "manual" as const, date: today };
  const claimed = posted.exchange_rate_source;
  const claimedDate = posted.exchange_rate_date;

  if (
    existing &&
    existing.exchange_rate_source &&
    existing.original_currency === currency &&
    sameRate(existing.exchange_rate_to_usd, posted.exchange_rate_to_usd) &&
    claimed === existing.exchange_rate_source &&
    claimedDate === existing.exchange_rate_date
  ) {
    return { source: existing.exchange_rate_source, date: existing.exchange_rate_date };
  }

  if (!claimedDate || !ISO_DATE.test(claimedDate)) return manualToday;

  switch (claimed) {
    case "daily_feed": {
      const feed = await lookupFeedRate(currency, claimedDate);
      return feed != null && sameRate(feed, posted.exchange_rate_to_usd)
        ? { source: "daily_feed", date: claimedDate }
        : manualToday;
    }
    case "forwarder_document":
      // Can't be checked against anything; the date is the quote's own date.
      return { source: "forwarder_document", date: claimedDate };
    default:
      // "manual" is always dated the day it's saved; "manual_legacy" can only
      // be kept, never newly claimed.
      return manualToday;
  }
}
