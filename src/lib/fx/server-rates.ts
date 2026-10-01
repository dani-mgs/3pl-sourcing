import type { createClient } from "@/lib/supabase/server";
import type { QuoteFields } from "@/lib/forwarder/parse-quote-form";
import { verifyRateProvenance, type LatestRates, type SavedRate } from "./rate-provenance";

// Server-side reads of fx_rates for the quote pages and save actions, through
// the signed-in user's client (fx_rates is readable by any signed-in user).

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Latest stored rate per currency, for pre-filling and "Refresh to latest
// rate" on the quote form. Empty if the feed hasn't run yet.
export async function loadLatestFxRates(supabase: Supabase): Promise<LatestRates> {
  const { data, error } = await supabase
    .from("fx_rates_latest")
    .select("currency, rate_date, rate_to_usd");
  if (error) {
    console.error("loadLatestFxRates error:", error);
    return {};
  }
  const latest: LatestRates = {};
  for (const row of data ?? []) {
    latest[row.currency as string] = {
      rateToUsd: Number(row.rate_to_usd),
      rateDate: row.rate_date as string,
    };
  }
  return latest;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Replaces the form's claimed source/date with what the server can stand
// behind (see verifyRateProvenance). `existing` is the quote being edited.
export async function withVerifiedRateProvenance(
  supabase: Supabase,
  data: QuoteFields,
  existing: SavedRate | null,
): Promise<QuoteFields> {
  const { source, date } = await verifyRateProvenance(
    data as SavedRate,
    existing,
    todayUtc(),
    async (currency, rateDate) => {
      const { data: row } = await supabase
        .from("fx_rates")
        .select("rate_to_usd")
        .eq("currency", currency)
        .eq("rate_date", rateDate)
        .maybeSingle();
      return row ? Number(row.rate_to_usd) : null;
    },
  );
  return { ...data, exchange_rate_source: source, exchange_rate_date: date };
}
