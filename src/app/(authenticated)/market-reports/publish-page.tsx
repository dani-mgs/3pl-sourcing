import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { getUserRole } from "@/lib/auth/get-user-role";
import { effectiveTier } from "@/lib/client-tiers";
import { LocalDate } from "@/components/client-portal/local-date";
import { MarketReportView } from "@/components/client-portal/market-report";
import { planMarketReport } from "@/lib/client-updates/build-market-report";
import { utcToday } from "@/lib/client-updates/dates";
import { loadMarketReportSource } from "@/lib/client-updates/load-market-report-source";
import { storedInputs } from "@/lib/client-updates/market-report-inputs";
import { parseMarketReport } from "@/lib/client-updates/market-report-schema";
import { OUTCOME_LABELS } from "@/lib/client-updates/market-report-view";
import { isShortlistedForwarder } from "@/lib/client-updates/partners";
import { projectPath, sharePath } from "@/lib/client-updates/share-paths";
import { reportAudienceText } from "@/lib/client-updates/share-text";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { ReportForm, type ReportFormRow } from "./report-form";
import { RemoveReportButton } from "./remove-report-button";

// "Publish Market Report" for one forwarder project. Staff only (the staff
// layout and RLS); publishing needs the project's owner or an admin.
export async function MarketReportPublishPage({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const loaded = await loadMarketReportSource(supabase, projectId);
  if (!loaded) notFound();
  const { source, meta, labels, hints, reports } = loaded;
  const today = utcToday();

  const [{ canWrite }, role, { data: entitlement }] = await Promise.all([
    getOwnershipContext(projectId, "forwarder_projects"),
    getUserRole(),
    supabase.from("client_entitlements").select("tier, valid_until").eq("client_id", meta.clientId).maybeSingle(),
  ]);
  const paid = effectiveTier(entitlement) === "market_report";
  const validUntil = paid && entitlement?.valid_until ? (entitlement.valid_until as string).slice(0, 10) : null;

  const shortlist = source.forwarders.filter(isShortlistedForwarder).sort((a, b) => a.company_name.localeCompare(b.company_name));
  const previous = storedInputs(reports[0]?.inputs ?? null);
  const suggested = shortlist.find((f) => f.assessment === "Move Recommended")?.id ?? null;
  const recommendedId =
    previous?.recommendedId && shortlist.some((f) => f.id === previous.recommendedId) ? previous.recommendedId : suggested;
  const planned = planMarketReport(source, recommendedId, today, labels.byForwarder);
  const nameOf = new Map(source.forwarders.map((f) => [f.id, f.company_name]));
  const rows: ReportFormRow[] = planned.map((p) => {
    const before = previous?.partners[p.id];
    const hint = hints.get(p.id);
    return {
      id: p.id,
      name: nameOf.get(p.id) ?? "",
      shownAs: p.named ? "By name" : labels.byForwarder.has(p.id) ? `Partner ${labels.byForwarder.get(p.id)}` : "Next free letter",
      outcome: OUTCOME_LABELS[p.outcome],
      notTakenForward: p.outcome === "not_taken_forward",
      size: before?.size ?? hint?.size ?? null,
      region: before?.region ?? hint?.region ?? null,
      take: before?.take ?? null,
    };
  });
  const route = shortRouteLabel(source.project);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8">
      <div className="mb-1 text-xs text-neutral-muted">
        <Link href={projectPath("forwarder", projectId)} className="hover:underline">
          {meta.clientName}
          {route ? ` · ${route}` : ""}
        </Link>
        <span className="mx-1.5">/</span>
        <span>Market Report</span>
      </div>
      <h1 className="font-display text-2xl font-semibold text-move-navy">Publish Market Report for {meta.clientName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-muted">
        Every forwarder you contacted for this project, built from the project&apos;s figures when you preview. Shortlisted
        forwarders are named; every other one is shown as a letter (Partner D, E, …) with only its price, transit time,
        outcome, size and region. Forwarders that are Unfit, Do Not Contact or Withdrawn / No Response all show as
        &ldquo;Not taken forward&rdquo;, with no price, transit time or comment.
      </p>

      <p
        role="note"
        className={`mt-4 max-w-3xl rounded-lg border px-4 py-3 text-sm ${paid ? "border-neutral-border bg-white text-move-navy" : "border-portal-amber bg-portal-amber-bg text-portal-amber"}`}
      >
        {reportAudienceText(meta.clientName, paid, validUntil)}{" "}
        <Link href={`/client-access/${meta.clientId}/preview/market-report`} className="font-semibold underline">
          View as client
        </Link>
        {" · "}
        <Link href={sharePath("forwarder", projectId)} className="font-semibold underline">
          Share update
        </Link>
      </p>

      {canWrite ? (
        <div className="mt-6">
          <ReportForm
            projectId={projectId}
            clientName={meta.clientName}
            shortlist={shortlist.map((f) => ({ id: f.id, name: f.company_name }))}
            recommendedId={recommendedId}
            rows={rows}
            prefilled={previous != null}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm text-move-navy">Only the project&apos;s owner or an admin can publish its Market Report.</p>
      )}

      <section className="mt-10" aria-labelledby="report-history">
        <h2 id="report-history" className="font-display text-lg font-semibold text-move-navy">
          Published reports
        </h2>
        <p className="text-sm text-neutral-muted">
          Newest first. The client only ever sees the newest one (while they&apos;re on the Market Report plan). Published
          reports can&apos;t be edited: to correct one, publish a new one. Only an admin can remove one that was a mistake.
        </p>
        {reports.length === 0 ? (
          <p className="mt-3 text-sm text-move-navy">No Market Report published for this project yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {reports.map((r, i) => {
              const payload = parseMarketReport(r.payload);
              return (
                <li key={r.id} className="rounded-xl border border-neutral-border bg-white">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-move-navy">
                      <span className="font-semibold">
                        <LocalDate timestamp={r.published_at} />
                      </span>
                      <span>{payload ? `${payload.partners.length} forwarders` : "Can't be shown"}</span>
                      {payload?.author.firstName && <span className="text-neutral-muted">by {payload.author.firstName}</span>}
                      {i === 0 && <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-xs font-semibold">The one the client sees</span>}
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-neutral-border p-4">
                      {payload ? (
                        <MarketReportView payload={payload} publishedAt={r.published_at} />
                      ) : (
                        <p className="text-sm text-move-navy">This report can&apos;t be shown.</p>
                      )}
                      {role === "admin" && <RemoveReportButton projectId={projectId} reportId={r.id} />}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
