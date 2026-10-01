import {
  FRANKFURTER_URL,
  FX_CURRENCIES,
  parseFrankfurterResponse,
  planFxUpsert,
  type FetchedRate,
  type FxCurrency,
  type PreviousRate,
} from "./frankfurter";

// The daily FX job: fetch → validate → invert → sanity-check → upsert.
// Data access is passed in so the steps are testable without a network or
// database; the cron route supplies the real fetch and Supabase calls.

export type FxJobDeps = {
  fetchJson: (url: string) => Promise<unknown>;
  loadLatest: (currency: FxCurrency) => Promise<PreviousRate | null>;
  upsert: (rates: FetchedRate[]) => Promise<void>;
};

export type FxJobResult =
  | {
      ok: true;
      stored: { currency: FxCurrency; rateDate: string; rateToUsd: number }[];
      skipped: FxCurrency[];
      missing: FxCurrency[];
    }
  | { ok: false; error: string };

// On any failure nothing is written, so the app keeps using the last good
// rates (and shows them as stale once they're old enough).
export async function runFxRatesJob(deps: FxJobDeps): Promise<FxJobResult> {
  let body: unknown;
  try {
    body = await deps.fetchJson(FRANKFURTER_URL);
  } catch (error) {
    console.error("FX job: fetching the feed failed:", error);
    return { ok: false, error: "FX feed request failed." };
  }

  const parsed = parseFrankfurterResponse(body);
  if (!parsed.ok) {
    console.error("FX job:", parsed.error);
    return { ok: false, error: parsed.error };
  }
  if (parsed.missing.length > 0) {
    console.warn("FX job: feed returned no rate for", parsed.missing.join(", "));
  }

  let previous: Map<FxCurrency, PreviousRate>;
  try {
    const latest = await Promise.all(
      FX_CURRENCIES.map(async (currency) => [currency, await deps.loadLatest(currency)] as const),
    );
    previous = new Map(
      latest.filter((entry): entry is readonly [FxCurrency, PreviousRate] => entry[1] != null),
    );
  } catch (error) {
    console.error("FX job: loading previous rates failed:", error);
    return { ok: false, error: "Couldn't load previous rates." };
  }

  const { accept, skip } = planFxUpsert(parsed.rates, previous);
  for (const s of skip) {
    console.warn(
      `FX job: skipped ${s.currency} — moved ${(s.change * 100).toFixed(1)}% ` +
        `(old ${s.previous.rateToUsd} on ${s.previous.rateDate}, ` +
        `new ${s.fetched.rateToUsd} on ${s.fetched.rateDate}); keeping the old rate.`,
    );
  }

  if (accept.length > 0) {
    try {
      await deps.upsert(accept);
    } catch (error) {
      console.error("FX job: storing rates failed:", error);
      return { ok: false, error: "Couldn't store rates." };
    }
  }

  return {
    ok: true,
    stored: accept,
    skipped: skip.map((s) => s.currency),
    missing: parsed.missing,
  };
}
