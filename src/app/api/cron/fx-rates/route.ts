import { createAdminClient } from "@/lib/supabase/admin-client";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runFxRatesJob } from "@/lib/fx/fx-rates-job";

// Daily FX rates, run by Vercel Cron (schedule in vercel.json). This is the
// ONLY place the service-role client is used without an admin check: it's
// protected by CRON_SECRET instead, and only upserts fx_rates (see
// docs/SECURITY.md, "Service-role exception: cron routes").

// Worst case: the 15 s feed timeout, then two rounds of PGRST303 retries (the
// parallel previous-rate reads, then the upsert) at about 15.5 s of backoff
// each, plus the calls themselves — under a minute. Vercel Hobby allows up to
// 300 s; 60 s leaves headroom without letting a hung run linger.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const result = await runFxRatesJob({
    fetchJson: async (url) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`FX feed responded ${response.status}`);
      return response.json();
    },
    loadLatest: async (currency) => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("rate_date, rate_to_usd")
        .eq("currency", currency)
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { rateDate: data.rate_date, rateToUsd: Number(data.rate_to_usd) } : null;
    },
    upsert: async (rates) => {
      const fetchedAt = new Date().toISOString();
      const { error } = await supabase.from("fx_rates").upsert(
        rates.map((r) => ({
          rate_date: r.rateDate,
          currency: r.currency,
          rate_to_usd: r.rateToUsd,
          source: "frankfurter",
          fetched_at: fetchedAt,
        })),
        { onConflict: "rate_date,currency" },
      );
      if (error) throw error;
    },
  });

  // Logged details stay server-side; the response is only seen by Vercel Cron.
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
