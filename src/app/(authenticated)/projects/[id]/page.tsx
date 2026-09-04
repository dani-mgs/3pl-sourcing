import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClientOwner,
  getOwnershipContext,
} from "@/lib/auth/get-ownership-context";
import { ProjectStatusBadge } from "../../project-status-badge";
import {
  ClientRequirementsForm,
  type ClientRequirementsFields,
} from "./client-requirements-form";
import { ViewOnlyBanner } from "./view-only-banner";

const NEXT_STEPS = [
  { title: "3PL List", href: "providers" },
  { title: "Comparison", href: "comparison" },
  { title: "Recommendation", href: "recommendation" },
];

export default async function ProjectDetailsPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "id, client_name, status, date_created, current_incumbent_3pl, target_geography, benchmark_period, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, business_model, core_cost_categories, main_decision_focus, key_capability_needs, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);
  const owner = canWrite ? null : await getClientOwner(id);

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <div className="mt-2 mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {clientRequirement.client_name}
        </h1>
        <ProjectStatusBadge status={clientRequirement.status} />
      </div>
      <p className="mb-8 text-xs text-neutral-muted">
        Created {new Date(clientRequirement.date_created).toLocaleDateString()}
      </p>

      {!canWrite && owner && (
        <ViewOnlyBanner ownerDisplayName={owner.displayName} />
      )}

      <div className="mb-8">
        <ClientRequirementsForm
          clientRequirementId={id}
          fields={clientRequirement as ClientRequirementsFields}
          canWrite={canWrite}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {NEXT_STEPS.map((step) => (
          <Link
            key={step.title}
            href={`/projects/${id}/${step.href}`}
            className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm hover:bg-neutral-bg"
          >
            <h2 className="font-display text-lg font-semibold text-move-navy">
              {step.title}
            </h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
