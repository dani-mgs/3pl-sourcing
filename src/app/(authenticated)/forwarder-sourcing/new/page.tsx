import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/clients";
import { NewForwarderProjectEntry } from "./new-forwarder-project-entry";

export default async function NewForwarderProjectPage() {
  const clients = await listClients(await createClient());

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium tracking-wide text-neutral-muted uppercase">
          New Forwarder Project
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-move-navy">
          Project Info
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          Choose the client, then capture the shipment. Fields left blank can
          be filled in later. You become the project owner.
        </p>
      </div>

      <NewForwarderProjectEntry clients={clients} />
    </div>
  );
}
