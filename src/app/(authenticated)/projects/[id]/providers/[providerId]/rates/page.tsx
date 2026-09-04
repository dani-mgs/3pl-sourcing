import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { RateDetailsForm, type RateDetailsRow } from "./rate-details-form";

export default async function RateDetailsPage({
  params,
}: PageProps<"/projects/[id]/providers/[providerId]/rates">) {
  const { id, providerId } = await params;

  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("three_pl_providers")
    .select("id, company_name")
    .eq("id", providerId)
    .eq("client_requirement_id", id)
    .single();

  if (!provider) {
    notFound();
  }

  const { canWrite } = await getOwnershipContext(id);

  const { data: rateDetails } = await supabase
    .from("rate_details")
    .select(
      "receiving_rate, storage_rate, fulfillment_rate, dispatch_rate, adhoc_kitting_rate, adhoc_labelling_rate, returns_rate, annual_inv_count_rate, cycle_count_rate, inv_count_on_request_rate, setup_rate, onboarding_fee, security_deposit",
    )
    .eq("provider_id", providerId)
    .maybeSingle();

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers/${providerId}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to {provider.company_name}
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Rate Details
      </h1>

      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <RateDetailsForm
          clientRequirementId={id}
          providerId={providerId}
          rateDetails={rateDetails as RateDetailsRow | null}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
