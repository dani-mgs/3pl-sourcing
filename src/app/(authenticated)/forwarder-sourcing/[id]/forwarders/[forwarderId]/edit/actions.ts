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

export async function updateForwarder(
  projectId: string,
  forwarderId: string,
  formData: FormData,
): Promise<SaveForwarderState> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(forwarderId).success) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const { data: stored } = await supabase
    .from("forwarders")
    .select("email")
    .eq("id", forwarderId)
    .maybeSingle();

  const parsed = parseForwarderForm(formData, { previousEmail: stored?.email ?? null });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { data, error } = await supabase
    .from("forwarders")
    .update(parsed.data)
    .eq("id", forwarderId)
    // Belt and braces: the row must also belong to this project, so an id
    // for a forwarder on a different project can never be edited this way.
    .eq("forwarder_project_id", projectId)
    .select("id");

  if (error) {
    console.error("updateForwarder error:", error);
    return { error: UNEXPECTED };
  }
  if (!data || data.length === 0) {
    return { error: NO_PERMISSION };
  }

  revalidatePath(`/forwarder-sourcing/${projectId}`);
  redirect(`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}`);
}
