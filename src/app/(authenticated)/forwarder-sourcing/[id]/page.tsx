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
import { FORWARDER_PROJECT_FIELDS_SELECT } from "@/lib/forwarder/parse-project-form";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";
import { QUOTE_FIELDS_SELECT } from "@/lib/forwarder/parse-quote-form";
import {
  buildForwarderCostComparison,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
} from "@/lib/forwarder/cost-comparison";
import { pickBestQuotes, pipelineCounts } from "@/lib/forwarder/project-summary";
import { ProjectStatusBadge } from "../project-status-badge";
import { ExportMenu } from "./export-menu";
import { ForwardersTable, type ForwarderRow } from "./forwarders-table";
import { ProjectOverflowMenu } from "./project-overflow-menu";
import { QuoteComparisonPanel, type ComparisonQuote } from "./quote-comparison-panel";
import { ShipmentProfile } from "./shipment-profile";
import { SummaryTiles, type SummaryProject } from "./summary-tiles";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// "Ho Chi Minh City → Long Beach" for the header; falls back to the country
// when a city isn't set. The full lane is in the Shipment Profile.
function headerRoute(row: Record<string, unknown>): string | null {
  const origin = text(row.origin_city) ?? text(row.origin_country);
  const destination = text(row.destination_city) ?? text(row.destination_country);
  if (!origin && !destination) return null;
  return `${origin ?? "—"} → ${destination ?? "—"}`;
}

export default async function ForwarderProjectSummaryPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("forwarder_projects")
    .select(`id, updated_at, clients(name, business_model), ${FORWARDER_PROJECT_FIELDS_SELECT}`)
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const row = project as unknown as Record<string, unknown> & {
    status: string;
    updated_at: string;
    clients: unknown;
  };
  const client = embeddedOne(
    row.clients as { name: string; business_model: string | null } | null,
  );
  const clientName = client?.name ?? "—";
  const route = headerRoute(row);

  const capabilitySelect = CAPABILITY_FIELDS.map((c) => c.name).join(", ");
  const [{ canWrite, isOwner }, owner, { data: forwarderRows }, { data: quoteRows }] =
    await Promise.all([
      getOwnershipContext(id, "forwarder_projects"),
      getClientOwner(id, "forwarder_projects"),
      supabase
        .from("forwarders")
        .select(`id, company_name, contact_person, status, assessment, updated_at, ${capabilitySelect}`)
        .eq("forwarder_project_id", id)
        .order("company_name", { ascending: true }),
      supabase
        .from("forwarder_quotes")
        .select(`id, forwarder_id, ${QUOTE_FIELDS_SELECT}, forwarders!inner(company_name, status, forwarder_project_id)`)
        .eq("forwarders.forwarder_project_id", id),
    ]);

  // The select string above is built at runtime, so Supabase can't infer its
  // columns from the literal type.
  type ForwarderQueryRow = Omit<ForwarderRow, "updatedRelative"> & {
    updated_at: string;
  };
  const forwarders: ForwarderRow[] = (
    (forwarderRows ?? []) as unknown as ForwarderQueryRow[]
  ).map((f) => ({
    ...f,
    updatedRelative: formatRelativeTime(f.updated_at),
  }));

  // Same runtime-built-select-string typing issue as above; the embedded
  // `forwarders` relation also needs embeddedOne() since Supabase can return
  // it as an object or a single-item array depending on the join shape.
  type QuoteQueryRow = ForwarderQuoteInput & {
    id: string;
    forwarder_id: string;
    lead_time_min_days: number | null;
    lead_time_max_days: number | null;
    rate_valid_until: string | null;
    forwarders: { company_name: string; status: string } | { company_name: string; status: string }[] | null;
  };
  // Only the fields the comparison needs: these objects are passed to a
  // client component, so notes and other free text stay on the server.
  const comparisonQuotes: ComparisonQuote[] = ((quoteRows ?? []) as unknown as QuoteQueryRow[])
    .map((q): ComparisonQuote | null => {
      const forwarder = embeddedOne(q.forwarders);
      if (!forwarder) return null;
      return {
        id: q.id,
        forwarder_id: q.forwarder_id,
        forwarder_name: forwarder.company_name,
        forwarder_status: forwarder.status,
        scenario_group: q.scenario_group,
        shipment_mode: q.shipment_mode,
        shipment_type: q.shipment_type,
        incoterm: q.incoterm,
        actual_weight_kg: q.actual_weight_kg,
        chargeable_weight_kg: q.chargeable_weight_kg,
        cost_of_goods_usd: q.cost_of_goods_usd,
        original_currency: q.original_currency,
        original_amount: q.original_amount,
        exchange_rate_to_usd: q.exchange_rate_to_usd,
        duties_taxes_usd: q.duties_taxes_usd,
        other_charges_usd: q.other_charges_usd,
        quote_completeness: q.quote_completeness,
        lead_time_min_days: q.lead_time_min_days,
        lead_time_max_days: q.lead_time_max_days,
        rate_valid_until: q.rate_valid_until,
      };
    })
    .filter((q): q is ComparisonQuote => q !== null);

  const projectTerms = row as unknown as ForwarderProjectTerms;
  const summaryProject = row as unknown as SummaryProject;
  const { effectiveAnnualShipments, results } = buildForwarderCostComparison(
    projectTerms,
    comparisonQuotes,
  );
  const { best, rankedGroupCount } = pickBestQuotes(results);
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
        rankedGroupCount={rankedGroupCount}
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
              defaultGroup={best[0]?.quote.scenario_group ?? null}
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
