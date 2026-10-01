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
import { parseDeleteClient, parseUpdateClient } from "@/lib/admin/parse-admin-input";

export type ClientActionState = { error?: string; success?: boolean };

const FOREIGN_KEY_VIOLATION = "23503";
const NO_PERMISSION = "You don't have permission to make this change.";

// Client names and business models are shared by every project for that
// client, so only admins can change them (RLS enforces the same rule).
export async function updateClient(
  rawClientId: string,
  rawName: string,
  rawBusinessModel: string,
): Promise<ClientActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: NO_PERMISSION };
  }

  const parsed = parseUpdateClient({
    clientId: rawClientId,
    name: rawName,
    businessModel: rawBusinessModel,
  });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { clientId, name: trimmedName, businessModel } = parsed.data;

  const supabase = await createClient();

  const existing = await findClientByName(supabase, trimmedName);
  if (existing && existing.id !== clientId) {
    return { error: duplicateClientMessage(existing.name) };
  }

  const { data, error } = await supabase
    .from("clients")
    .update({
      name: trimmedName,
      business_model: businessModel,
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
  revalidatePath("/forwarder-sourcing", "layout");
  return { success: true };
}

// A client can only be deleted once no project in any module uses it; the
// client_id foreign keys (ON DELETE RESTRICT) back this up.
export async function deleteClient(
  rawClientId: string,
): Promise<ClientActionState> {
  if ((await getUserRole()) !== "admin") {
    return { error: NO_PERMISSION };
  }

  const parsed = parseDeleteClient({ clientId: rawClientId });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { clientId } = parsed.data;

  const supabase = await createClient();

  const results = await Promise.all(
    (["three_pl_projects", "forwarder_projects"] as const).map((table) =>
      supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId),
    ),
  );

  const countError = results.find((r) => r.error)?.error;
  if (countError) {
    console.error("deleteClient count error:", countError);
    return { error: "An unexpected error occurred." };
  }
  const count = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  if (count > 0) {
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
