"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientOption } from "@/lib/clients";
import { UNIQUE_VIOLATION } from "@/lib/clients";
import { checkNewClient, duplicateClientError, resolveClientId } from "@/lib/clients-server";
import { parseProjectForm } from "@/lib/three-pl/parse-project-form";

const UNEXPECTED = "An unexpected error occurred.";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create a project." };
  }

  // Validate the whole form before anything is saved (B-9: a failed submit
  // used to leave the new client behind, and every retry was refused).
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const intent = formData.get("intent") as string;
  let id = projectId;

  // A new project with a new client: both are created in one transaction, so
  // a failure leaves neither behind.
  if (!id && formData.get("client_mode") === "new") {
    const client = await checkNewClient(supabase, formData);
    if (!("name" in client)) {
      return client;
    }
    const { data, error } = await supabase.rpc("create_three_pl_project_with_client", {
      p_client_name: client.name,
      p_client_business_model: client.businessModel,
      p_project: parsed.data,
    });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        console.error("saveClientIntake client unique violation:", error);
        return duplicateClientError(supabase, client.name);
      }
      console.error("saveClientIntake create error:", error);
      return { error: UNEXPECTED };
    }
    if (!data) {
      return { error: "You don't have permission to make this change." };
    }
    if (intent === "draft") {
      redirect("/3pl-sourcing");
    }
    redirect(`/3pl-sourcing/new/${data}/providers`);
  }

  // An existing client (or an edit, which can only pick an existing client).
  const resolved = await resolveClientId(supabase, formData, Boolean(projectId));
  if (!("clientId" in resolved)) {
    return resolved;
  }

  const payload = {
    client_id: resolved.clientId,
    ...parsed.data,
  };

  if (id) {
    const { data, error } = await supabase
      .from("three_pl_projects")
      .update(payload)
      .eq("id", id)
      .select();

    if (error) {
      console.error("saveClientIntake update error:", error);
      return { error: UNEXPECTED };
    }
    if (!data || data.length === 0) {
      return { error: "You don't have permission to make this change." };
    }
  } else {
    const { data, error } = await supabase
      .from("three_pl_projects")
      .insert({ ...payload, owner_id: user.id, status: "Active" })
      .select("id")
      .single();

    if (error) {
      console.error("saveClientIntake insert error:", error);
      return { error: UNEXPECTED };
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
