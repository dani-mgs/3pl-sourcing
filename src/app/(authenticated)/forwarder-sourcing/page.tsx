import { createClient } from "@/lib/supabase/server";
import { embeddedOne } from "@/lib/clients";
import { formatRelativeTime } from "@/lib/relative-time";
import { routeLabel } from "@/lib/forwarder/project-display";
import {
  ForwarderProjectList,
  type ForwarderProjectRow,
} from "./forwarder-project-list";

export default async function ForwarderSourcingPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: projects, error },
    { data: profiles },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("forwarder_projects")
      .select(
        "id, owner_id, status, shipment_mode, updated_at, origin_city, origin_country, destination_city, destination_country, clients(name, business_model)",
      )
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, email, first_name"),
  ]);

  if (error) {
    console.error("ForwarderSourcingPage projects error:", error);
  }

  const ownerDisplayById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.first_name?.trim() || profile.email,
    ]),
  );

  const rows: ForwarderProjectRow[] = (projects ?? []).map((project) => {
    const client = embeddedOne(project.clients);
    const isMine = project.owner_id === user?.id;
    return {
      id: project.id,
      clientName: client?.name ?? "—",
      businessModel: client?.business_model ?? null,
      isMine,
      ownerDisplay: isMine ? "You" : (ownerDisplayById.get(project.owner_id) ?? "—"),
      route: routeLabel(project),
      mode: project.shipment_mode,
      status: project.status,
      updatedRelative: formatRelativeTime(project.updated_at),
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <ForwarderProjectList rows={rows} />
    </div>
  );
}
