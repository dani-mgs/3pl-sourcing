import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  RecommendationForm,
  type RecommendationRow,
  type VettedProvider,
} from "./recommendation-form";

export default async function RecommendationPage({
  params,
}: PageProps<"/projects/[id]/recommendation">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const { data: vettedProviders } = await supabase
    .from("providers")
    .select("id, company_name, cost, service_capability, turnaround_time")
    .eq("project_id", id)
    .eq("status", "Vetted")
    .order("company_name", { ascending: true });

  const { data: recommendation } = await supabase
    .from("recommendations")
    .select("priority, provider_id_1, provider_id_2, provider_id_3, notes")
    .eq("project_id", id)
    .maybeSingle();

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to project
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Recommendation
      </h1>

      {!vettedProviders || vettedProviders.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No vetted 3PLs yet. Vet at least one provider before making a
            recommendation.{" "}
            <Link
              href={`/projects/${id}/providers`}
              className="font-medium text-move-green hover:underline"
            >
              Go to 3PL List
            </Link>
          </p>
        </div>
      ) : (
        <RecommendationForm
          projectId={id}
          providers={vettedProviders as VettedProvider[]}
          recommendation={recommendation as RecommendationRow | null}
        />
      )}
    </div>
  );
}
