"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { resolveClientId } from "@/lib/clients-server";
import { explainEmptyDelete } from "@/lib/delete-errors";
import type { ClientOption } from "@/lib/clients";
import { parseForwarderProjectForm } from "@/lib/forwarder/parse-project-form";

export type SaveForwarderProjectState = {
  error?: string;
  existingClient?: ClientOption;
};

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const FOREIGN_KEY_VIOLATION = "23503";

const projectIdSchema = z.string().uuid();

// Creates (projectId null) or updates a forwarder project. Ownership is
// checked here as well as by RLS, and the form is validated before anything
// is written, so a bad form never leaves a new client behind.
export async function saveForwarderProject(
  projectId: string | null,
  formData: FormData,
): Promise<SaveForwarderProjectState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to save a project." };
  }

  if (projectId !== null) {
    if (!projectIdSchema.safeParse(projectId).success) {
      return { error: NO_PERMISSION };
    }
    const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
    if (!canWrite) {
      return { error: NO_PERMISSION };
    }
  }

  const parsed = parseForwarderProjectForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const resolved = await resolveClientId(supabase, formData, projectId !== null);
  if (!("clientId" in resolved)) {
    return resolved;
  }

  let id = projectId;
  if (id) {
    const { data, error } = await supabase
      .from("forwarder_projects")
      .update({ ...parsed.data, client_id: resolved.clientId })
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("saveForwarderProject update error:", error);
      return { error: UNEXPECTED };
    }
    if (!data || data.length === 0) {
      return { error: NO_PERMISSION };
    }
  } else {
    const { data, error } = await supabase
      .from("forwarder_projects")
      .insert({
        ...parsed.data,
        status: "Active",
        client_id: resolved.clientId,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("saveForwarderProject insert error:", error);
      return { error: UNEXPECTED };
    }
    if (!data) {
      return { error: NO_PERMISSION };
    }
    id = data.id;
  }

  revalidatePath("/forwarder-sourcing");
  redirect(`/forwarder-sourcing/${id}`);
}

export type DeleteForwarderProjectState = { error?: string };

// Deletes a forwarder project and keeps its client. The database blocks the
// delete while forwarders are attached (ON DELETE RESTRICT).
export async function deleteForwarderProject(
  projectId: string,
): Promise<DeleteForwarderProjectState> {
  if (!projectIdSchema.safeParse(projectId).success) {
    return { error: NO_PERMISSION };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const { data, error } = await supabase
    .from("forwarder_projects")
    .delete()
    .eq("id", projectId)
    .select("id");

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      console.error("deleteForwarderProject foreign key violation:", error);
      return {
        error:
          "This project has forwarder(s) attached. Delete them first, then delete this project.",
      };
    }
    console.error("deleteForwarderProject error:", error);
    return { error: UNEXPECTED };
  }

  if (!data || data.length === 0) {
    return {
      error: await explainEmptyDelete(supabase, "forwarder_projects", projectId),
    };
  }

  revalidatePath("/forwarder-sourcing");
  redirect("/forwarder-sourcing");
}
