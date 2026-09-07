import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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
      <Link
        href="/dashboard"
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <div className="mt-2 mb-8">
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

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
            <QuickAddProviders
              clientRequirementId={id}
              initialProviders={providers ?? []}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              nativeButton={false}
              render={<Link href={`/dashboard/new/${id}/review`} />}
              className="px-4 py-2.5"
            >
              Continue to Verify →
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/dashboard/new/${id}/review`} />}
              className="px-4 py-2.5"
            >
              Skip for now →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
