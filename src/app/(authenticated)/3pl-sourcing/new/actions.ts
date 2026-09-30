"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientOption } from "@/lib/clients";
import { resolveClientId } from "@/lib/clients-server";
import { parseProjectForm } from "@/lib/three-pl/parse-project-form";

// existingClient is set when a "new client" name turned out to match an
// existing client, so the form can offer "Use existing client".
export type SaveClientIntakeState = {
  error?: string;
  existingClient?: ClientOption;
};

export async function saveClientIntake(
  projectId: string | null,
  formData: FormData,
): Promise<SaveClientIntakeState> {
  const supabase = await createClient();

  const resolved = await resolveClientId(supabase, formData, Boolean(projectId));
  if (!("clientId" in resolved)) {
    return resolved;
  }

  const parsed = parseProjectForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const payload = {
    client_id: resolved.clientId,
    ...parsed.data,
  };

  const intent = formData.get("intent") as string;
  let id = projectId;

  if (id) {
    const { data, error } = await supabase
      .from("three_pl_projects")
      .update(payload)
      .eq("id", id)
      .select();

    if (error) {
      console.error("saveClientIntake update error:", error);
      return { error: "An unexpected error occurred." };
    }
    if (!data || data.length === 0) {
      return { error: "You don't have permission to make this change." };
    }
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "You must be signed in to create a project." };
    }

    const { data, error } = await supabase
      .from("three_pl_projects")
      .insert({ ...payload, owner_id: user.id, status: "Active" })
      .select("id")
      .single();

    if (error) {
      console.error("saveClientIntake insert error:", error);
      return { error: "An unexpected error occurred." };
    }
    if (!data) {
      return { error: "You don't have permission to make this change." };
    }
    id = data.id;
  }

  if (intent === "draft") {
    redirect("/3pl-sourcing");
  }
  redirect(`/3pl-sourcing/new/${id}/providers`);
}
