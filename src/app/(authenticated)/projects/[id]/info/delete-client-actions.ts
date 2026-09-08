"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DeleteClientState = { error?: string };

const FOREIGN_KEY_VIOLATION = "23503";

export async function deleteClientRequirement(
  clientRequirementId: string,
): Promise<DeleteClientState> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_requirements")
    .delete()
    .eq("id", clientRequirementId)
    .select();

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      console.error("deleteClientRequirement foreign key violation:", error);
      return {
        error:
          "This client has 3PL(s) attached. Delete or reassign them before deleting this client.",
      };
    }
    console.error("deleteClientRequirement error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  redirect("/dashboard");
}
