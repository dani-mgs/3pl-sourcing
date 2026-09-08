import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClientOwner,
  getOwnershipContext,
} from "@/lib/auth/get-ownership-context";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { ToggleChipDisplay } from "@/components/toggle-chip-display";
import { parseChipValue } from "@/lib/chip-value";
import { ViewOnlyBanner } from "./view-only-banner";
import { DeleteClientButton } from "./delete-client-button";

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-neutral-muted">{label}</dt>
      <dd className="text-sm text-move-navy">{value || "—"}</dd>
    </div>
  );
}

export default async function ClientInfoPage({
  params,
}: PageProps<"/projects/[id]/info">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "client_name, date_created, updated_at, business_model, target_geography, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);
  const owner = canWrite ? null : await getClientOwner(id);

  const { count: providerCount } = canWrite
    ? await supabase
        .from("three_pl_providers")
        .select("id", { count: "exact", head: true })
        .eq("client_requirement_id", id)
    : { count: null };

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="mb-2 text-xs text-neutral-muted">
        <Link href="/dashboard" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <span>{clientRequirement.client_name}</span>
      </div>

      <div className="mt-2 mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {clientRequirement.client_name}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {canWrite && (
            <>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projects/${id}/info/edit`} />}
              >
                Edit
              </Button>
              <DeleteClientButton
                clientRequirementId={id}
                clientName={clientRequirement.client_name}
                providerCount={providerCount ?? 0}
              />
            </>
          )}
        </div>
      </div>
      <p className="mb-8 text-xs text-neutral-muted">
        Last updated{" "}
        {new Date(clientRequirement.updated_at).toLocaleDateString()}
      </p>

      {!canWrite && owner && (
        <ViewOnlyBanner ownerDisplayName={owner.displayName} />
      )}

      <div className="flex flex-col gap-6">
        <SectionCard title="Client Overview">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField
              label="Business Model"
              value={clientRequirement.business_model}
            />
            <InfoField
              label="Target Geography"
              value={clientRequirement.target_geography}
            />
          </dl>
        </SectionCard>

        <SectionCard title="Volume Metrics">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField
              label="Average Monthly Orders"
              value={clientRequirement.avg_monthly_orders}
            />
            <InfoField
              label="Peak Monthly Orders"
              value={clientRequirement.peak_monthly_orders}
            />
            <InfoField
              label="Latest Month Orders"
              value={clientRequirement.latest_month_orders}
            />
            <InfoField
              label="Average Monthly Units"
              value={clientRequirement.avg_monthly_units}
            />
            <InfoField
              label="Peak Monthly Units"
              value={clientRequirement.peak_monthly_units}
            />
            <InfoField
              label="Benchmark Period"
              value={clientRequirement.benchmark_period}
            />
          </dl>
        </SectionCard>

        <SectionCard title="Business Context">
          <div className="flex flex-col gap-4">
            <div>
              <dt className="mb-2 text-xs text-neutral-muted">
                Core Cost Categories
              </dt>
              <ToggleChipDisplay
                chips={parseChipValue(
                  clientRequirement.core_cost_categories,
                ).map((label) => ({ label, selected: true }))}
              />
            </div>
            <div>
              <dt className="mb-2 text-xs text-neutral-muted">
                Services Required
              </dt>
              <ToggleChipDisplay
                chips={parseChipValue(
                  clientRequirement.key_capability_needs,
                ).map((label) => ({ label, selected: true }))}
              />
            </div>
            <InfoField
              label="Main Decision Focus"
              value={clientRequirement.main_decision_focus}
            />
          </div>
        </SectionCard>

        <SectionCard title="Requirements & Constraints">
          <dl className="grid grid-cols-1 gap-4">
            <InfoField
              label="Technology/Integration Requirement"
              value={clientRequirement.tech_integration_requirement}
            />
            <InfoField
              label="Special Handling Requirement"
              value={clientRequirement.special_handling_requirement}
            />
            <InfoField
              label="Fixed Comparison Principle"
              value={clientRequirement.fixed_comparison_principle}
            />
            <InfoField
              label="Important Limitation"
              value={clientRequirement.important_limitation}
            />
            <InfoField
              label="Assumptions/Data Limitations"
              value={clientRequirement.assumptions_data_limitations}
            />
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
