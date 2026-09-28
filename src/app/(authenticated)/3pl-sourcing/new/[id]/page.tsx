import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { WizardSteps } from "@/components/wizard-steps";
import { listClients } from "@/lib/clients";
import {
  ClientIntakeForm,
  type ClientIntakeFields,
} from "../client-intake-form";

export default async function EditClientIntakePage({
  params,
}: PageProps<"/3pl-sourcing/new/[id]">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id);
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: clientRequirement } = await supabase
    .from("three_pl_projects")
    .select(
      "client_id, target_geography, avg_monthly_orders, peak_monthly_orders, latest_month_orders, avg_monthly_units, peak_monthly_units, benchmark_period, core_cost_categories, key_capability_needs, main_decision_focus, tech_integration_requirement, special_handling_requirement, fixed_comparison_principle, important_limitation, assumptions_data_limitations",
    )
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const clients = await listClients(supabase);

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          New Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Project Info
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Choose the client, then capture this project&apos;s requirements.
          Fields left blank can be filled in later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={1} />

        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <ClientIntakeForm
            projectId={id}
            clients={clients}
            initialClient={{
              mode: "existing",
              clientId: clientRequirement.client_id,
            }}
            defaultValues={clientRequirement as ClientIntakeFields}
            backHref={`/3pl-sourcing/new/${id}/review`}
            backLabel="← Back to Review"
          />
        </div>
      </div>
    </div>
  );
}
