import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import {
  RecommendationForm,
  type RecommendationRow,
  type VettedProvider,
} from "./recommendation-form";

export default async function RecommendationPage({
  params,
}: PageProps<"/3pl-sourcing/projects/[id]/recommendation">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("three_pl_projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { data: vettedProviders } = await supabase
    .from("three_pl_providers")
    .select(
      "id, company_name, location, status, overall_assessment, currency, storage_cost, pick_pack_cost, receiving_cost, returns_cost, system_setup_cost, inventory_on_request_cost, adhoc_bundling_kitting_cost, adhoc_labelling_cost, b2b_pick_pack_cost, created_at",
    )
    .eq("three_pl_project_id", id)
    .eq("status", "Vetted")
    .order("created_at", { ascending: true });

  const { data: recommendation } = await supabase
    .from("recommendation")
    .select("priority")
    .eq("three_pl_project_id", id)
    .maybeSingle();

  const { canWrite } = await getOwnershipContext(id);

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/3pl-sourcing/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to project
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Recommendation
      </h1>

      <ViewOnlyBanner clientRequirementId={id} canWrite={canWrite} />

      {!vettedProviders || vettedProviders.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No vetted 3PLs yet. Vet at least one 3PL before making a
            recommendation.{" "}
            <Link
              href={`/3pl-sourcing/projects/${id}`}
              className="font-medium text-move-green hover:underline"
            >
              Go to Project Summary
            </Link>
          </p>
        </div>
      ) : (
        <RecommendationForm
          projectId={id}
          providers={vettedProviders as VettedProvider[]}
          recommendation={recommendation as RecommendationRow | null}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
