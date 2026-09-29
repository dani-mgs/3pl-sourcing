import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { NewForwarderEntry } from "./new-forwarder-entry";

export default async function NewForwarderPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/new">) {
  const { id } = await params;

  const { canWrite } = await getOwnershipContext(id, "forwarder_projects");
  if (!canWrite) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href={`/forwarder-sourcing/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Project
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Add Forwarder
      </h1>

      <NewForwarderEntry projectId={id} />
    </div>
  );
}
