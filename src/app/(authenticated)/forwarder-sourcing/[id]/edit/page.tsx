import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { listClients } from "@/lib/clients";
import {
  FORWARDER_PROJECT_FIELDS_SELECT,
  type ForwarderProjectFields,
} from "@/lib/forwarder/parse-project-form";
import { ForwarderProjectForm } from "../../forwarder-project-form";

export default async function EditForwarderProjectPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/edit">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id, "forwarder_projects");
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("forwarder_projects")
    .select(`client_id, ${FORWARDER_PROJECT_FIELDS_SELECT}`)
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const clients = await listClients(supabase);
  const { client_id, ...fields } = project as unknown as ForwarderProjectFields & {
    client_id: string;
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          Forwarder Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Edit Project Info
        </h1>
      </div>

      <ForwarderProjectForm
        projectId={id}
        clients={clients}
        initialClient={{ mode: "existing", clientId: client_id }}
        defaultValues={fields}
        cancelHref={`/forwarder-sourcing/${id}`}
      />
    </div>
  );
}
