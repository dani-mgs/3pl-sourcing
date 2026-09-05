"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveNotesState = { error?: string; success?: boolean };

export async function updateSummaryNotes(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveNotesState> {
  const supabase = await createClient();
  const summaryNotes = (formData.get("summary_notes") as string) || null;

  const { data, error } = await supabase
    .from("client_requirements")
    .update({ summary_notes: summaryNotes })
    .eq("id", clientRequirementId)
    .select();

  if (error) {
    console.error("updateSummaryNotes error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/projects/${clientRequirementId}`);
  return { success: true };
}
