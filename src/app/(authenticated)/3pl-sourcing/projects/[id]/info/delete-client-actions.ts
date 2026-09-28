"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { explainEmptyDelete } from "@/lib/delete-errors";

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
          "This client has 3PL(s) attached. Delete them first, then delete this client.",
      };
    }
    console.error("deleteClientRequirement error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: await explainEmptyDelete(supabase, "client_requirements", clientRequirementId) };
  }

  redirect("/3pl-sourcing");
}
