"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveRecommendationState = { error?: string; success?: boolean };

export async function saveRecommendation(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveRecommendationState> {
  const supabase = await createClient();

  const providerId = (name: string) => {
    const value = formData.get(name) as string;
    return value ? value : null;
  };

  const payload = {
    client_requirement_id: clientRequirementId,
    priority: formData.get("priority") as string,
    provider_id_1: providerId("provider_id_1"),
    provider_id_2: providerId("provider_id_2"),
    provider_id_3: providerId("provider_id_3"),
    generated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("recommendation")
    .select("id")
    .eq("client_requirement_id", clientRequirementId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("recommendation")
        .update(payload)
        .eq("id", existing.id)
    : await supabase.from("recommendation").insert(payload);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${clientRequirementId}/recommendation`);
  return { success: true };
}
