import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { formatCurrency } from "@/lib/currency";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { loadLatestFxRates, todayUtc } from "@/lib/fx/server-rates";
import { ORIGIN_COUNTRIES, countryName } from "@/lib/tariff/countries";
import { loadAuthorNames } from "@/lib/tariff/estimate-authors";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { HTS_SOURCE_URL } from "@/lib/tariff/calculate";
import { excludedCount } from "@/lib/tariff/programs";
import { EstimateForm } from "./estimate-form";

// Tariff Calculator: estimate US base duty, MPF and HMF for one HTS line,
// and the list of saved (locked) estimates. Any signed-in user can use it.
export default async function TariffCalculatorPage() {
  const supabase = await createClient();
  const [latestRates, releaseResult, estimatesResult, permissions] = await Promise.all([
    loadLatestFxRates(supabase),
    supabase
      .from("hts_releases")
      .select("name, title, release_start_date")
      .eq("status", "current")
      .maybeSingle(),
    supabase
      .from("duty_estimates")
      .select("id, created_at, created_by, label, hts_code, origin_country, total_usd, warnings")
      .order("created_at", { ascending: false })
      .limit(20),
    getTariffPermissions(),
  ]);
  if (releaseResult.error) console.error("TariffCalculatorPage release error:", releaseResult.error);
  if (estimatesResult.error) console.error("TariffCalculatorPage estimates error:", estimatesResult.error);

  const release = releaseResult.data;
  const estimates = estimatesResult.data ?? [];
  const authors = await loadAuthorNames(
    supabase,
    estimates.map((e) => e.created_by as string),
  );

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">Tariff Calculator</h1>
        {permissions.canEditTariffData && (
          <Link
            href="/tariff-calculator/duty-data"
            className="rounded text-sm font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
          >
            Duty data →
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-neutral-muted">
        Estimate US import duty and fees for one HTS line. Estimates only — verify with your customs broker.
      </p>
      <p className="mt-2 mb-8 text-xs text-neutral-muted">
        {release ? (
          <>
            Base rates: HTSUS {release.title ?? release.name}
            {release.release_start_date && <>, in effect from {formatRateDate(release.release_start_date)}</>}
            , from{" "}
            <a
              href={HTS_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded font-medium text-move-navy underline decoration-neutral-border underline-offset-2 outline-none hover:decoration-move-green focus-visible:ring-2 focus-visible:ring-move-green"
            >
              USITC
            </a>
            .
          </>
        ) : (
          "HTS data hasn't been imported yet, so estimates aren't available."
        )}
      </p>

      <EstimateForm latestRates={latestRates} today={todayUtc()} countries={ORIGIN_COUNTRIES} />

      <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Saved estimates</h2>
        {estimates.length === 0 ? (
          <p className="text-sm text-neutral-muted">No saved estimates yet. Calculate one, then Save estimate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-move-navy">
              <thead>
                <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                  <th scope="col" className="px-4 py-3 font-medium">Saved</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">HTS code</th>
                  <th scope="col" className="px-4 py-3 font-medium">Origin</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total (USD)</th>
                  <th scope="col" className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-border last:border-0 hover:bg-neutral-bg">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/tariff-calculator/estimates/${e.id}`}
                        className="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
                      >
                        {formatRateDate((e.created_at as string).slice(0, 10))}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{e.label ?? <span className="text-neutral-muted">—</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatHtsCode(e.hts_code as string)}</td>
                    <td className="px-4 py-3">{countryName(e.origin_country as string)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums">{formatCurrency(Number(e.total_usd), "USD")}</span>
                      {excludedCount(e.warnings) > 0 && (
                        // Same rule as the estimate itself: a total that leaves
                        // programs out never reads as complete.
                        <span className="block text-xs font-medium text-[#92400E]">
                          Excludes {excludedCount(e.warnings)} additional duty program
                          {excludedCount(e.warnings) === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{authors.get(e.created_by as string) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
