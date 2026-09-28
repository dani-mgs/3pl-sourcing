"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { parseForwarderForm } from "@/lib/forwarder/parse-forwarder-form";

export type SaveForwarderState = { error?: string };

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const uuid = z.string().uuid();

export async function createForwarder(
  projectId: string,
  formData: FormData,
): Promise<SaveForwarderState> {
  if (!uuid.safeParse(projectId).success) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const parsed = parseForwarderForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forwarders")
    .insert({ ...parsed.data, forwarder_project_id: projectId })
    .select("id")
    .single();

  if (error) {
    console.error("createForwarder insert error:", error);
    return { error: UNEXPECTED };
  }
  if (!data) {
    return { error: NO_PERMISSION };
  }

  revalidatePath(`/forwarder-sourcing/${projectId}`);
  redirect(`/forwarder-sourcing/${projectId}/forwarders/${data.id}`);
}
