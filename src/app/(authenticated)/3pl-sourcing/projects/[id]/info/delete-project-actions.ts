"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { explainEmptyDelete } from "@/lib/delete-errors";

export type DeleteProjectState = { error?: string };

const FOREIGN_KEY_VIOLATION = "23503";

// Deletes one 3PL project. Its client record in `clients` is shared with any
// other projects for that client and is kept; admins can remove an unused
// client from Administration.
export async function deleteProject(
  projectId: string,
): Promise<DeleteProjectState> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_projects")
    .delete()
    .eq("id", projectId)
    .select();

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      console.error("deleteProject foreign key violation:", error);
      return {
        error:
          "This project has 3PL(s) attached. Delete them first, then delete this project.",
      };
    }
    console.error("deleteProject error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return {
      error: await explainEmptyDelete(supabase, "three_pl_projects", projectId),
    };
  }

  redirect("/3pl-sourcing");
}
