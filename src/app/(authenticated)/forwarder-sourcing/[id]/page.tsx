import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClientOwner,
  getOwnershipContext,
} from "@/lib/auth/get-ownership-context";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { embeddedOne } from "@/lib/clients";
import { formatRelativeTime } from "@/lib/relative-time";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";
import type { ForwarderProjectTerms } from "@/lib/forwarder/cost-comparison";
import { loadProjectComparison } from "@/lib/forwarder/load-project-comparison";
import { loadProjectDutyEstimates } from "@/lib/forwarder/load-duty-estimates";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import { pickBestQuotes, pipelineCounts } from "@/lib/forwarder/project-summary";
import { ProjectStatusBadge } from "../project-status-badge";
import { estimateDutiesHref } from "./duty-estimate-links";
import { DutyEstimatesList } from "./duty-estimates";
import { ExportMenu } from "./export-menu";
import { ForwardersTable, type ForwarderRow } from "./forwarders-table";
import { ProjectOverflowMenu } from "./project-overflow-menu";
import { QuoteComparisonPanel } from "./quote-comparison-panel";
import { ShipmentProfile } from "./shipment-profile";
import { SummaryTiles, type SummaryProject } from "./summary-tiles";

export default async function ForwarderProjectSummaryPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const comparison = await loadProjectComparison(supabase, id);
  if (!comparison) {
    notFound();
  }
  const { project: row, quotes: comparisonQuotes, results, effectiveAnnualShipments } =
    comparison;
  const client = embeddedOne(
    row.clients as { name: string; business_model: string | null } | null,
  );
  const clientName = client?.name ?? "—";
  const route = shortRouteLabel(row);

  const capabilitySelect = CAPABILITY_FIELDS.map((c) => c.name).join(", ");
  const [{ canWrite, isOwner }, owner, { data: forwarderRows }, dutyEstimates] = await Promise.all([
    getOwnershipContext(id, "forwarder_projects"),
    getClientOwner(id, "forwarder_projects"),
    supabase
      .from("forwarders")
      .select(`id, company_name, contact_person, status, assessment, updated_at, ${capabilitySelect}`)
      .eq("forwarder_project_id", id)
      .order("company_name", { ascending: true }),
    loadProjectDutyEstimates(supabase, comparison),
  ]);

  // The select string above is built at runtime, so Supabase can't infer its
  // columns from the literal type.
  type ForwarderQueryRow = Omit<ForwarderRow, "updatedRelative" | "dutyEstimateCount"> & {
    updated_at: string;
  };
  const forwarders: ForwarderRow[] = (
    (forwarderRows ?? []) as unknown as ForwarderQueryRow[]
  ).map((f) => ({
    ...f,
    updatedRelative: formatRelativeTime(f.updated_at),
    dutyEstimateCount: comparisonQuotes
      .filter((q) => q.forwarder_id === f.id)
      .reduce((sum, q) => sum + (dutyEstimates.countByQuote.get(q.id) ?? 0), 0),
  }));

  const projectTerms = row as unknown as ForwarderProjectTerms;
  const summaryProject = row as unknown as SummaryProject;
  const { best } = pickBestQuotes(results);
  const pipeline = pipelineCounts(forwarders, comparisonQuotes);
  // Server date (UTC on Vercel) for rate-expiry flags.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-[1680px] px-8 py-6">
      <div className="mb-1 text-xs text-neutral-muted">
        <Link href="/forwarder-sourcing" className="hover:underline">
          Forwarder Sourcing
        </Link>
        <span className="mx-1.5">/</span>
        <span>{clientName}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-semibold break-words text-move-navy">
              {clientName}
              {route && (
                <span className="font-normal text-neutral-muted"> · {route}</span>
              )}
            </h1>
            <ProjectStatusBadge status={row.status} />
          </div>
          <p className="mt-1 text-xs text-neutral-muted">
            {client?.business_model && <>{client.business_model} · </>}
            Owner {isOwner ? "You" : (owner?.displayName ?? "—")} · Last updated{" "}
            {new Date(row.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={estimateDutiesHref(id)} />}
            >
              Estimate duties
            </Button>
          )}
          {canWrite && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/forwarder-sourcing/${id}/edit`} />}
            >
              Edit
            </Button>
          )}
          <ExportMenu projectId={id} />
          {canWrite && (
            <ProjectOverflowMenu
              projectId={id}
              clientName={clientName}
              forwarderCount={forwarders.length}
              dutyEstimateCount={dutyEstimates.total}
            />
          )}
        </div>
      </div>

      <ViewOnlyBanner
        clientRequirementId={id}
        canWrite={canWrite}
        table="forwarder_projects"
      />

      <SummaryTiles
        project={summaryProject}
        best={best}
        hasQuotes={comparisonQuotes.length > 0}
        effectiveAnnualShipments={effectiveAnnualShipments}
        pipeline={pipeline}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <aside className="self-start xl:sticky xl:top-24 xl:order-2 xl:max-h-[calc(100svh-7rem)] xl:overflow-y-auto">
          <ShipmentProfile row={row} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 xl:order-1">
          <SectionCard title="Quote Comparison">
            <QuoteComparisonPanel
              projectId={id}
              results={results}
              bestQuoteIds={best.map((r) => r.quote.id)}
              baseline={projectTerms.current_freight_cost_usd}
              targetLeadTime={row.target_lead_time_days as number | null}
              today={today}
              finalTerms={projectTerms}
            />
          </SectionCard>

          <SectionCard title="Duty estimates">
            <DutyEstimatesList
              rows={dutyEstimates.estimates}
              projectId={id}
              canWrite={canWrite}
              emptyText={
                canWrite
                  ? "No duty estimates yet. Use Estimate duties above, or Estimate duties for this quote in a quote's menu."
                  : "No duty estimates yet."
              }
            />
          </SectionCard>

          <SectionCard title="Forwarders">
            <ForwardersTable projectId={id} forwarders={forwarders} canWrite={canWrite} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
