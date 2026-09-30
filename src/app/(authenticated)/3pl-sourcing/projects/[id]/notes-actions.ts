"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSummaryNotesForm } from "@/lib/three-pl/parse-project-form";

export type SaveNotesState = { error?: string; success?: boolean };

export async function updateSummaryNotes(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveNotesState> {
  const parsed = parseSummaryNotesForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_projects")
    .update(parsed.data)
    .eq("id", clientRequirementId)
    .select();

  if (error) {
    console.error("updateSummaryNotes error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/3pl-sourcing/projects/${clientRequirementId}`);
  return { success: true };
}
