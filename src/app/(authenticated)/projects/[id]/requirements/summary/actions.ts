"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveRequirementsSummaryState = {
  error?: string;
  success?: boolean;
};

export async function saveRequirementsSummary(
  projectId: string,
  formData: FormData,
): Promise<SaveRequirementsSummaryState> {
  const supabase = await createClient();

  const payload = {
    project_id: projectId,
    location: formData.get("location") as string,
    storage_requirements: formData.get("storage_requirements") as string,
    order_volume: formData.get("order_volume") as string,
    sku_count: formData.get("sku_count") as string,
    b2b_or_b2c: formData.get("b2b_or_b2c") as string,
    special_handling_requirements: formData.get(
      "special_handling_requirements",
    ) as string,
    target_cost: formData.get("target_cost") as string,
    turnaround_time: formData.get("turnaround_time") as string,
    notes: formData.get("notes") as string,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("requirements_summary")
    .upsert(payload, { onConflict: "project_id" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}/requirements/summary`);
  return { success: true };
}
