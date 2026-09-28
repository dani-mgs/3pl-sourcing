"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import {
  UNIQUE_VIOLATION,
  duplicateClientMessage,
  findClientByName,
} from "@/lib/clients";
import { explainEmptyDelete } from "@/lib/delete-errors";

export type ClientActionState = { error?: string; success?: boolean };

const FOREIGN_KEY_VIOLATION = "23503";
const NO_PERMISSION = "You don't have permission to make this change.";

// Client names and business models are shared by every project for that
// client, so only admins can change them (RLS enforces the same rule).
export async function updateClient(
  clientId: string,
  name: string,
  businessModel: string,
): Promise<ClientActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: NO_PERMISSION };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Client name is required." };
  }

  const supabase = await createClient();

  const existing = await findClientByName(supabase, trimmedName);
  if (existing && existing.id !== clientId) {
    return { error: duplicateClientMessage(existing.name) };
  }

  const { data, error } = await supabase
    .from("clients")
    .update({
      name: trimmedName,
      business_model: businessModel.trim() || null,
    })
    .eq("id", clientId)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("updateClient unique violation:", error);
      const raced = await findClientByName(supabase, trimmedName);
      return { error: duplicateClientMessage(raced?.name ?? trimmedName) };
    }
    console.error("updateClient error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: NO_PERMISSION };
  }

  revalidatePath("/admin");
  revalidatePath("/3pl-sourcing", "layout");
  return { success: true };
}

// A client can only be deleted once no 3PL project uses it; the
// three_pl_projects.client_id foreign key (ON DELETE RESTRICT) backs this up.
export async function deleteClient(
  clientId: string,
): Promise<ClientActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: NO_PERMISSION };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("three_pl_projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (countError) {
    console.error("deleteClient count error:", countError);
    return { error: "An unexpected error occurred." };
  }
  if (count && count > 0) {
    return {
      error: `This client has ${count} project(s). Delete them first, then delete this client.`,
    };
  }

  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .select("id");

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      console.error("deleteClient foreign key violation:", error);
      return {
        error:
          "This client has project(s). Delete them first, then delete this client.",
      };
    }
    console.error("deleteClient error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: await explainEmptyDelete(supabase, "clients", clientId) };
  }

  revalidatePath("/admin");
  return { success: true };
}
