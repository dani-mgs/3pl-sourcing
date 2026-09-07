import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WizardSteps } from "@/components/wizard-steps";
import { QuickAddProviders } from "./quick-add-providers";

export default async function AddProvidersStepPage({
  params,
}: PageProps<"/dashboard/new/[id]/providers">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select("id")
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select("id, company_name, location, contact_person, status")
    .eq("client_requirement_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Add 3PLs
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Add as many as you have right now — you can add more or fill in
          full details later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
        <WizardSteps currentStep={2} />

        <QuickAddProviders
          clientRequirementId={id}
          initialProviders={providers ?? []}
          backHref={`/dashboard/new/${id}`}
          reviewHref={`/dashboard/new/${id}/review`}
        />
      </div>
    </div>
  );
}
