import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { loadLatestFxRates, todayUtc } from "@/lib/fx/server-rates";
import { ORIGIN_COUNTRIES } from "@/lib/tariff/countries";
import { loadAuthorNames } from "@/lib/tariff/estimate-authors";
import { HTS_SOURCE_URL } from "@/lib/tariff/calculate";
import { releaseLabel } from "@/lib/tariff/hts-lookup";
import { loadLinkContext, type LinkContextResult } from "@/lib/tariff/server-forwarder-link";
import { loadKeyDates } from "@/lib/tariff/server-key-dates";
import { EstimateForm } from "./estimate-form";
import { KeyDatesPanel } from "./key-dates-panel";
import { SavedEstimatesTable, type SavedEstimateListRow } from "./saved-estimates-table";
import { WARNING_BOX_CLASS } from "./estimate-result";

const one = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : null);

// Tariff Calculator: estimate US base duty, MPF and HMF for one HTS line,
// and the list of saved (locked) estimates. Any signed-in user can use it.
// Opened with ?project=<id>[&quote=<id>] from Forwarder Sourcing, the form is
// pre-filled from that project or quote for the owner or an admin to confirm.
// HTS lookup is a popup in the form; an old ?hts= link (from the lookup
// page this replaced) just drops the parameter.
export default async function TariffCalculatorPage({ searchParams }: PageProps<"/tariff-calculator">) {
  const params = await searchParams;
  const projectId = one(params.project);
  const quoteId = one(params.quote);
  if (params.hts !== undefined) {
    const keep = new URLSearchParams();
    if (projectId) keep.set("project", projectId);
    if (projectId && quoteId) keep.set("quote", quoteId);
    redirect(keep.size > 0 ? `/tariff-calculator?${keep}` : "/tariff-calculator");
  }
  const supabase = await createClient();
  const [latestRates, releaseResult, estimatesResult, permissions, upcomingDates] = await Promise.all([
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
    loadKeyDates(supabase, todayUtc()),
  ]);
  if (releaseResult.error) console.error("TariffCalculatorPage release error:", releaseResult.error);
  if (estimatesResult.error) console.error("TariffCalculatorPage estimates error:", estimatesResult.error);

  let link: LinkContextResult | null = null;
  if (projectId) {
    try {
      link = await loadLinkContext(supabase, projectId, quoteId, latestRates, todayUtc());
    } catch (error) {
      console.error("TariffCalculatorPage link error:", error);
      link = { status: "not_found" };
    }
  }

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

      {link && link.status !== "ok" && (
        <p className={`${WARNING_BOX_CLASS} mb-6`} role="note">
          {link.status === "not_allowed"
            ? "Only the project's owner or an admin can create duty estimates for it. You can still use the calculator below without linking."
            : "That forwarder project or quote wasn't found. You can still use the calculator below without linking."}
        </p>
      )}

      <EstimateForm
        // Remount when the link changes so the suggestions reset.
        key={link?.status === "ok" ? link.context.sourceVersion : "unlinked"}
        latestRates={latestRates}
        today={todayUtc()}
        countries={ORIGIN_COUNTRIES}
        link={link?.status === "ok" ? link.context : undefined}
        htsRelease={
          release
            ? {
                label: releaseLabel(release),
                effective: release.release_start_date ? formatRateDate(release.release_start_date) : null,
              }
            : null
        }
      />

      <KeyDatesPanel dates={upcomingDates} />

      <SavedEstimatesTable estimates={estimates as SavedEstimateListRow[]} authors={authors} />
    </div>
  );
}
