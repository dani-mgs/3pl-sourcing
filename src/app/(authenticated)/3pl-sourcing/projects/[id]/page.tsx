import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Button } from "@/components/ui/button";
import { NotesCard } from "./notes-card";
import {
  CostComparisonPanel,
  type PanelProvider,
} from "./cost-comparison-panel";
import { COST_SELECT } from "@/lib/cost-comparison";
import {
  ProjectSummaryTable,
  type ProviderRow,
} from "./project-summary-table";

const QUOTES_IN_STATUSES = [
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Completed / Closed",
];

const AGGREGATE_CAPABILITIES: { key: keyof ProviderRow; label: string }[] = [
  { key: "receiving", label: "Receiving" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "returns", label: "Returns" },
];

const PROVIDER_SELECT = `id, company_name, location, status, assessment_status, is_incumbent, onboarding_period_months, contact_person, receiving, storage, fulfillment, dispatch, adhoc_kitting_bundling, adhoc_labelling, returns, lot_batch_expiry_tracking, temp_controlled_storage, ${COST_SELECT}` as const;

export default async function ProjectSummaryPage({
  params,
}: PageProps<"/3pl-sourcing/projects/[id]">) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "id, client_name, target_geography, business_model, owner_id, date_created, summary_notes",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);

  const isOwner = clientRequirement.owner_id === user?.id;

  const { data: ownerProfile } = isOwner
    ? { data: null }
    : await supabase
        .from("profiles")
        .select("first_name, email")
        .eq("id", clientRequirement.owner_id)
        .single();

  const ownerDisplay = isOwner
    ? "You"
    : (ownerProfile?.first_name?.trim() ?? ownerProfile?.email ?? "—");

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select(PROVIDER_SELECT)
    .eq("client_requirement_id", id)
    .order("created_at", { ascending: false });

  const providerRows = (providers ?? []) as ProviderRow[];

  const sourcedCount = providerRows.length;
  const quotesInCount = providerRows.filter((p) =>
    QUOTES_IN_STATUSES.includes(p.status),
  ).length;
  const shortlistedCount = providerRows.filter(
    (p) => p.status === "Shortlisted",
  ).length;

  const aggregateCapabilityLabels = AGGREGATE_CAPABILITIES.filter((cap) =>
    providerRows.some((p) => p[cap.key]),
  ).map((cap) => cap.label);

  return (
    <div className="mx-auto max-w-[1680px] px-8 py-10">
      <div className="mb-2 text-xs text-neutral-muted">
        <Link href="/3pl-sourcing" className="hover:underline">
          3PL Sourcing
        </Link>
        <span className="mx-1.5">/</span>
        <span>{clientRequirement.client_name}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">
            <Link
              href={`/3pl-sourcing/projects/${id}/info`}
              className="hover:underline"
            >
              {clientRequirement.client_name}
            </Link>
            {clientRequirement.target_geography && (
              <span> · {clientRequirement.target_geography}</span>
            )}
          </h1>
          {clientRequirement.business_model && (
            <p className="mt-1 text-sm text-neutral-muted">
              {clientRequirement.business_model}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-muted">
            Owner {ownerDisplay}
            {aggregateCapabilityLabels.length > 0 &&
              ` · ${aggregateCapabilityLabels.join(", ")}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              nativeButton={false}
              render={<Link href={`/3pl-sourcing/projects/${id}/providers/new`} />}
            >
              Add 3PL
            </Button>
          )}
        </div>
      </div>

      <ViewOnlyBanner clientRequirementId={id} canWrite={canWrite} />

      {sourcedCount === 0 ? (
        <div className="mb-8 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No 3PLs sourced yet.
            {canWrite && (
              <>
                {" "}
                <Link
                  href={`/3pl-sourcing/projects/${id}/providers/new`}
                  className="font-medium text-move-green hover:underline"
                >
                  Add 3PL
                </Link>{" "}
                to get started.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
              <p className="text-3xl font-semibold text-move-navy">
                {sourcedCount}
              </p>
              <p className="mt-1 text-sm text-neutral-muted">Sourced</p>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
              <p className="text-3xl font-semibold text-move-navy">
                {quotesInCount}
              </p>
              <p className="mt-1 text-sm text-neutral-muted">Quotes In</p>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
              <p className="text-3xl font-semibold text-move-navy">
                {shortlistedCount}
              </p>
              <p className="mt-1 text-sm text-neutral-muted">Shortlisted</p>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 min-[1480px]:grid-cols-[minmax(0,1fr)_340px] min-[1480px]:items-start">
            <aside className="min-[1480px]:sticky min-[1480px]:top-24 min-[1480px]:order-2">
              <CostComparisonPanel
                projectId={id}
                providers={(providers ?? []) as PanelProvider[]}
              />
            </aside>
            <div className="min-w-0 min-[1480px]:order-1">
              <ProjectSummaryTable
                projectId={id}
                providers={providerRows}
                canWrite={canWrite}
              />
            </div>
          </div>
        </>
      )}

      <NotesCard
        clientRequirementId={id}
        initialNotes={clientRequirement.summary_notes}
        canWrite={canWrite}
      />
    </div>
  );
}
