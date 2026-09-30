"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RATE_DETAILS_NOT_SAVED_ERROR, saveRateDetails } from "@/lib/rate-details";
import { parseProviderForm } from "@/lib/three-pl/parse-provider-form";

export type UpdateProviderState = { error?: string };

const UNIQUE_VIOLATION = "23505";

export async function updateProvider(
  clientRequirementId: string,
  providerId: string,
  formData: FormData,
): Promise<UpdateProviderState> {
  const parsed = parseProviderForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_providers")
    .update(parsed.data)
    .eq("id", providerId)
    .select();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("updateProvider unique violation:", error);
      return {
        error:
          "Only one 3PL can be marked as incumbent for this project — uncheck the existing incumbent first.",
      };
    }
    console.error("updateProvider error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  const ratesSaved = await saveRateDetails(
    supabase,
    providerId,
    parsed.rates,
    "update",
  );
  if (!ratesSaved) {
    return { error: RATE_DETAILS_NOT_SAVED_ERROR };
  }

  redirect(`/3pl-sourcing/projects/${clientRequirementId}/providers/${providerId}`);
}
