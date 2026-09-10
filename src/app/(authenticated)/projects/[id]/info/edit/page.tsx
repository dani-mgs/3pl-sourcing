import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import type { ClientIntakeFields } from "@/components/client-intake-form";
import { EditClientInfoForm } from "./edit-client-info-form";

export default async function EditClientInfoPage({
  params,
}: PageProps<"/projects/[id]/info/edit">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id);
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select(
      "client_name, business_model, target_geography, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/info`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Client Info
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Edit Client Info
      </h1>

      <EditClientInfoForm
        clientRequirementId={id}
        defaultValues={clientRequirement as ClientIntakeFields}
      />
    </div>
  );
}
