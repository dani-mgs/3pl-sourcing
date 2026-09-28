"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { explainEmptyDelete } from "@/lib/delete-errors";

export type DeleteForwarderState = { error?: string };

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const uuid = z.string().uuid();

// Deletes one forwarder. forwarder_quotes.forwarder_id is ON DELETE CASCADE
// (unlike forwarders.forwarder_project_id, which is RESTRICT), so this never
// blocks on quotes existing — it just takes them with it. The confirm dialog
// says so up front.
export async function deleteForwarder(
  projectId: string,
  forwarderId: string,
): Promise<DeleteForwarderState> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(forwarderId).success) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forwarders")
    .delete()
    .eq("id", forwarderId)
    .eq("forwarder_project_id", projectId)
    .select();

  if (error) {
    console.error("deleteForwarder error:", error);
    return { error: UNEXPECTED };
  }

  if (!data || data.length === 0) {
    return {
      error: await explainEmptyDelete(supabase, "forwarders", forwarderId),
    };
  }

  redirect(`/forwarder-sourcing/${projectId}`);
}
