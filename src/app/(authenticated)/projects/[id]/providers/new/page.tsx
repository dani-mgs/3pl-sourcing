import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewProviderForm } from "./new-provider-form";

export default async function NewProviderPage({
  params,
}: PageProps<"/projects/[id]/providers/new">) {
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

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to 3PL List
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Add Provider
      </h1>

      <div className="max-w-sm rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <NewProviderForm projectId={id} />
      </div>
    </div>
  );
}
