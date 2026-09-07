import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClientOwner,
  getOwnershipContext,
} from "@/lib/auth/get-ownership-context";
import { ClientInfoForm } from "./client-info-form";
import type { ClientIntakeFields } from "@/components/client-intake-form";
import { ViewOnlyBanner } from "./view-only-banner";

export default async function ClientInfoPage({
  params,
}: PageProps<"/projects/[id]/info">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "client_name, date_created, business_model, target_geography, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
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
        href={`/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Project
      </Link>

      <div className="mt-2 mb-2">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {clientRequirement.client_name}
        </h1>
      </div>
      <p className="mb-8 text-xs text-neutral-muted">
        Created {new Date(clientRequirement.date_created).toLocaleDateString()}
      </p>

      {!canWrite && owner && (
        <ViewOnlyBanner ownerDisplayName={owner.displayName} />
      )}

      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <ClientInfoForm
          clientRequirementId={id}
          defaultValues={clientRequirement as ClientIntakeFields}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
