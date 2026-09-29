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
import { PROJECT_SECTIONS } from "@/lib/forwarder/project-sections";
import { formatProjectValue, routeLabel } from "@/lib/forwarder/project-display";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";
import { QUOTE_FIELDS_SELECT } from "@/lib/forwarder/parse-quote-form";
import type { ForwarderProjectTerms, ForwarderQuoteInput } from "@/lib/forwarder/cost-comparison";
import { ProjectStatusBadge } from "../project-status-badge";
import { DeleteForwarderProjectButton } from "./delete-forwarder-project-button";
import { ExportBar } from "./export-bar";
import { ForwardersTable, type ForwarderRow } from "./forwarders-table";
import { QuoteComparisonPanel, type ComparisonQuote } from "./quote-comparison-panel";

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
  const route = routeLabel(row);

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
    forwarders: { company_name: string; status: string } | { company_name: string; status: string }[] | null;
  };
  const comparisonQuotes: ComparisonQuote[] = ((quoteRows ?? []) as unknown as QuoteQueryRow[])
    .map((q): ComparisonQuote | null => {
      const { forwarders, ...quoteFields } = q;
      const forwarder = embeddedOne(forwarders);
      if (!forwarder) return null;
      return {
        ...quoteFields,
        forwarder_name: forwarder.company_name,
        forwarder_status: forwarder.status,
      };
    })
    .filter((q): q is ComparisonQuote => q !== null);

  const projectTerms = row as unknown as ForwarderProjectTerms;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-2 text-xs text-neutral-muted">
        <Link href="/forwarder-sourcing" className="hover:underline">
          Forwarder Sourcing
        </Link>
        <span className="mx-1.5">/</span>
        <span>{clientName}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-move-navy">
              {clientName}
              {route && (
                <span className="font-normal text-neutral-muted"> · {route}</span>
              )}
            </h1>
            <ProjectStatusBadge status={row.status} />
          </div>
          {client?.business_model && (
            <p className="mt-1 text-sm text-neutral-muted">{client.business_model}</p>
          )}
          <p className="mt-1 text-xs text-neutral-muted">
            Owner {isOwner ? "You" : (owner?.displayName ?? "—")} · Last updated{" "}
            {new Date(row.updated_at).toLocaleDateString()}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/forwarder-sourcing/${id}/edit`} />}
            >
              Edit
            </Button>
            <DeleteForwarderProjectButton
              projectId={id}
              clientName={clientName}
              forwarderCount={forwarders.length}
            />
          </div>
        )}
      </div>

      <ViewOnlyBanner
        clientRequirementId={id}
        canWrite={canWrite}
        table="forwarder_projects"
      />

      <ExportBar projectId={id} />

      <div className="flex flex-col gap-6">
        {PROJECT_SECTIONS.map((section) => (
          <SectionCard key={section.title} title={section.title}>
            {section.description && (
              <p className="-mt-2 mb-4 text-xs text-neutral-muted">
                {section.description}
              </p>
            )}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div
                  key={field.name}
                  className={
                    field.kind === "textarea" || field.kind === "multi"
                      ? "sm:col-span-2"
                      : undefined
                  }
                >
                  <dt className="text-xs text-neutral-muted">{field.label}</dt>
                  <dd className="text-sm whitespace-pre-line text-move-navy">
                    {formatProjectValue(field, row)}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        ))}

        <SectionCard title="Forwarders">
          <ForwardersTable projectId={id} forwarders={forwarders} canWrite={canWrite} />
        </SectionCard>

        <SectionCard title="Quote Comparison">
          <QuoteComparisonPanel projectId={id} project={projectTerms} quotes={comparisonQuotes} />
        </SectionCard>
      </div>
    </div>
  );
}
