import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import {
  FORWARDER_FIELDS_SELECT,
  type ForwarderFields,
} from "@/lib/forwarder/parse-forwarder-form";
import { ForwarderForm } from "../../forwarder-form";

export default async function EditForwarderPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/[forwarderId]/edit">) {
  const { id, forwarderId } = await params;

  const { canWrite } = await getOwnershipContext(id, "forwarder_projects");
  if (!canWrite) {
    notFound();
  }

  const supabase = await createClient();
  const { data: forwarder } = await supabase
    .from("forwarders")
    .select(FORWARDER_FIELDS_SELECT)
    .eq("id", forwarderId)
    .eq("forwarder_project_id", id)
    .single();

  if (!forwarder) {
    notFound();
  }
  // The select string above is built at runtime, so Supabase can't infer
  // its columns from the literal type; the Zod-derived type is the real
  // contract here (see FORWARDER_FIELDS_SELECT).
  const fields = forwarder as unknown as ForwarderFields;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href={`/forwarder-sourcing/${id}/forwarders/${forwarderId}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to {fields.company_name}
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        Edit Forwarder
      </h1>

      <ForwarderForm
        projectId={id}
        forwarderId={forwarderId}
        defaultValues={fields}
        cancelHref={`/forwarder-sourcing/${id}/forwarders/${forwarderId}`}
      />
    </div>
  );
}
