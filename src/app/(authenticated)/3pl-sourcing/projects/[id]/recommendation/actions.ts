"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseRecommendationForm } from "@/lib/three-pl/parse-recommendation-form";

export type SaveRecommendationState = { error?: string; success?: boolean };

const NOT_THIS_PROJECT = "Choose 3PLs from this project.";

export async function saveRecommendation(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const parsed = parseRecommendationForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // The top three must be 3PLs of this project (QA B-5): the page only offers
  // its own Vetted 3PLs, but a crafted post could name any provider id.
  const chosen = [...new Set(
    [parsed.data.provider_id_1, parsed.data.provider_id_2, parsed.data.provider_id_3].filter(
      (id): id is string => id != null,
    ),
  )];
  if (chosen.length > 0) {
    const { data: own, error: ownError } = await supabase
      .from("three_pl_providers")
      .select("id")
      .eq("three_pl_project_id", clientRequirementId)
      .in("id", chosen);
    if (ownError) {
      console.error("saveRecommendation provider check error:", ownError);
      return { error: "An unexpected error occurred." };
    }
    if ((own ?? []).length !== chosen.length) {
      return { error: NOT_THIS_PROJECT };
    }
  }

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
