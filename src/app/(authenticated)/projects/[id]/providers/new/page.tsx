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
    <div className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink-navy">
        Add Provider
      </h1>

      <div className="rounded-2xl border border-fog bg-white p-6 shadow-sm">
        <NewProviderForm projectId={id} />
      </div>
    </div>
  );
}
