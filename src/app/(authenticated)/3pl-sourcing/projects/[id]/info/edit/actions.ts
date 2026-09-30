"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { parseProjectForm } from "@/lib/three-pl/parse-project-form";

export type SaveClientRequirementsState = {
  error?: string;
};

export async function updateClientRequirements(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveClientRequirementsState> {
  const { canWrite } = await getOwnershipContext(clientRequirementId);
  if (!canWrite) {
    return { error: "You don't have permission to make this change." };
  }

  const parsed = parseProjectForm(formData);
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
    console.error("updateClientRequirements error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  redirect(`/3pl-sourcing/projects/${clientRequirementId}/info`);
}
