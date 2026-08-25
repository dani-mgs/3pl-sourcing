import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditProviderForm } from "./edit-provider-form";

export default async function EditProviderPage({
  params,
}: PageProps<"/projects/[id]/providers/[providerId]/edit">) {
  const { id, providerId } = await params;

  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("providers")
    .select(
      "id, company_name, website, contact_person, email, phone, location, cost, service_capability, turnaround_time, notes, status",
    )
    .eq("id", providerId)
    .eq("project_id", id)
    .single();

  if (!provider) {
    notFound();
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers/${providerId}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to {provider.company_name}
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Edit Provider
      </h1>

      <div className="max-w-sm rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <EditProviderForm
          projectId={id}
          providerId={providerId}
          defaultValues={{
            company_name: provider.company_name ?? "",
            website: provider.website ?? "",
            contact_person: provider.contact_person ?? "",
            email: provider.email ?? "",
            phone: provider.phone ?? "",
            location: provider.location ?? "",
            cost: provider.cost ?? "",
            service_capability: provider.service_capability ?? "",
            turnaround_time: provider.turnaround_time ?? "",
            notes: provider.notes ?? "",
            status: provider.status ?? "Potential",
          }}
        />
      </div>
    </div>
  );
}
