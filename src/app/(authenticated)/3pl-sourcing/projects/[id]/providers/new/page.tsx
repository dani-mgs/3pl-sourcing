import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { AddProviderEntry } from "./add-provider-entry";

export default async function NewProviderPage({
  params,
}: PageProps<"/3pl-sourcing/projects/[id]/providers/new">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id);
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("three_pl_projects")
    .select("id")
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/3pl-sourcing/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Project
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Add 3PL
      </h1>

      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <AddProviderEntry clientRequirementId={id} />
      </div>
    </div>
  );
}
