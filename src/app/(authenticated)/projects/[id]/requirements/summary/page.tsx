import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  RequirementsSummaryForm,
  type RequirementsSummaryRow,
} from "./summary-form";

export default async function RequirementsSummaryPage({
  params,
}: PageProps<"/projects/[id]/requirements/summary">) {
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

  const { data: summary } = await supabase
    .from("requirements_summary")
    .select(
      "location, storage_requirements, order_volume, sku_count, b2b_or_b2c, special_handling_requirements, target_cost, turnaround_time, notes",
    )
    .eq("project_id", id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/projects/${id}/requirements`}
        className="text-sm font-medium text-route-indigo hover:underline"
      >
        ← Back to Client Requirements
      </Link>

      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold text-ink-navy">
        Requirements Summary
      </h1>

      <div className="rounded-2xl border border-fog bg-white p-6 shadow-sm">
        <RequirementsSummaryForm
          projectId={id}
          summary={summary as RequirementsSummaryRow | null}
        />
      </div>
    </div>
  );
}
