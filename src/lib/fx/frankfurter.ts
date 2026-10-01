import { z } from "zod";
import { CURRENCIES } from "@/lib/forwarder/project-fields";

// Daily FX feed: Frankfurter v2's blended central-bank rates
// (https://frankfurter.dev — keyless, no quotas, no attribution required).
// Pure parsing and planning only; the cron route does the fetching and
// writing (src/app/api/cron/fx-rates/route.ts).

// Every quote currency except USD, the base. Same values as the fx_rates
// currency check constraint.
export const FX_CURRENCIES = CURRENCIES.filter((c) => c !== "USD");
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export const FRANKFURTER_URL = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${FX_CURRENCIES.join(",")}`;

// A fetched rate that moves more than this from the last stored rate is
// treated as bad data and skipped (the last good rate stays in use).
export const MAX_DAILY_CHANGE = 0.2;

// fx_rates.rate_to_usd is numeric(20,10).
const RATE_DECIMALS = 10;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// One record per currency pair; base=USD means `rate` is units per 1 USD.
const responseSchema = z.array(
  z.object({
    date: isoDate,
    base: z.literal("USD"),
    quote: z.string(),
    rate: z.number().positive().finite(),
  }),
);

export type FetchedRate = {
  currency: FxCurrency;
  rateDate: string;
  // USD per 1 unit of currency (the inverse of the feed's rate).
  rateToUsd: number;
};

export type ParseResult =
  | { ok: true; rates: FetchedRate[]; missing: FxCurrency[] }
  | { ok: false; error: string };

function toUsdPerUnit(unitsPerUsd: number): number {
  const factor = 10 ** RATE_DECIMALS;
  return Math.round((1 / unitsPerUsd) * factor) / factor;
}

// Validates the feed's response and turns each wanted currency into USD per
// unit. Unknown currencies (and the USD identity record) are ignored; wanted
// ones that are absent are reported as missing rather than failing the run.
export function parseFrankfurterResponse(body: unknown): ParseResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Unexpected response shape from the FX feed." };
  }

  const wanted = new Set<string>(FX_CURRENCIES);
  const rates: FetchedRate[] = [];
  for (const record of parsed.data) {
    if (!wanted.has(record.quote)) continue;
    const rateToUsd = toUsdPerUnit(record.rate);
    // A rate so small it rounds to 0 at 10 decimals can't be stored.
    if (rateToUsd <= 0) continue;
    rates.push({
      currency: record.quote as FxCurrency,
      rateDate: record.date,
      rateToUsd,
    });
  }

  const seen = new Set(rates.map((r) => r.currency));
  return { ok: true, rates, missing: FX_CURRENCIES.filter((c) => !seen.has(c)) };
}

export type PreviousRate = { rateDate: string; rateToUsd: number };

export type SkippedRate = {
  currency: FxCurrency;
  previous: PreviousRate;
  fetched: FetchedRate;
  change: number;
};

// Decides which fetched rates to store. A currency's first rate (no previous
// row) is always accepted; after that, a move of more than MAX_DAILY_CHANGE
// from the last stored rate is skipped, so that currency keeps its last good
// rate and shows as stale in the app until a sane rate arrives.
export function planFxUpsert(
  fetched: FetchedRate[],
  previous: Map<FxCurrency, PreviousRate>,
): { accept: FetchedRate[]; skip: SkippedRate[] } {
  const accept: FetchedRate[] = [];
  const skip: SkippedRate[] = [];
  for (const rate of fetched) {
    const prior = previous.get(rate.currency);
    if (!prior) {
      accept.push(rate);
      continue;
    }
    const change = Math.abs(rate.rateToUsd - prior.rateToUsd) / prior.rateToUsd;
    if (change > MAX_DAILY_CHANGE) {
      skip.push({ currency: rate.currency, previous: prior, fetched: rate, change });
    } else {
      accept.push(rate);
    }
  }
  return { accept, skip };
}
