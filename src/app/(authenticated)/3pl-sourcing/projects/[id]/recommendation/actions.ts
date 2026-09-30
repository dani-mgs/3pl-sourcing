"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseRecommendationForm } from "@/lib/three-pl/parse-recommendation-form";

export type SaveRecommendationState = { error?: string; success?: boolean };

export async function saveRecommendation(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const parsed = parseRecommendationForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const payload = {
    three_pl_project_id: clientRequirementId,
    ...parsed.data,
    generated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("recommendation")
    .select("id")
    .eq("three_pl_project_id", clientRequirementId)
    .maybeSingle();

  const { data, error } = existing
    ? await supabase
        .from("recommendation")
        .update(payload)
        .eq("id", existing.id)
        .select()
    : await supabase.from("recommendation").insert(payload).select();

  if (error) {
    console.error("saveRecommendation error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/3pl-sourcing/projects/${clientRequirementId}/recommendation`);
  return { success: true };
}
