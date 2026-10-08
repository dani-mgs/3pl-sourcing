import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import type { ClientIntakeFields } from "@/components/client-intake-form";
import { embeddedOne } from "@/lib/clients";
import { EditClientInfoForm } from "./edit-client-info-form";

export default async function EditProjectInfoPage({
  params,
}: PageProps<"/3pl-sourcing/projects/[id]/info/edit">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id);
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("three_pl_projects")
    .select(
      "clients(name, business_model), target_geography, contract_period_months, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { clients, ...projectFields } = clientRequirement;
  const client = embeddedOne(clients);

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/3pl-sourcing/projects/${id}/info`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Project Info
      </Link>

      <h1 className="mt-2 font-display text-2xl font-semibold text-move-navy">
        Edit Project Info
      </h1>
      <p className="mt-1 mb-8 text-sm text-neutral-muted">
        Client:{" "}
        <span className="font-medium text-move-navy">{client?.name ?? "—"}</span>
        {client?.business_model && <> · {client.business_model}</>}
        <span className="block text-xs">
          Client details are shared across projects and can only be edited by
          an admin.
        </span>
      </p>

      <EditClientInfoForm
        clientRequirementId={id}
        defaultValues={projectFields as ClientIntakeFields}
      />
    </div>
  );
}
