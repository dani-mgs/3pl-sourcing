import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WizardSteps } from "@/components/wizard-steps";
import {
  ClientIntakeForm,
  type ClientIntakeFields,
} from "../client-intake-form";

export default async function EditClientIntakePage({
  params,
}: PageProps<"/dashboard/new/[id]">) {
  const { id } = await params;

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
      <div className="mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          New Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Client Intake
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Everything captured here writes to the client record. Fields left
          blank can be filled in later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={1} />

        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <ClientIntakeForm
            clientRequirementId={id}
            defaultValues={clientRequirement as ClientIntakeFields}
            backHref={`/dashboard/new/${id}/review`}
            backLabel="← Back to Review"
          />
        </div>
      </div>
    </div>
  );
}
