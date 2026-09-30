"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RATE_DETAILS_NOT_SAVED_ERROR, saveRateDetails } from "@/lib/rate-details";
import { parseProviderForm } from "@/lib/three-pl/parse-provider-form";

// savedProviderId is set when the 3PL row was created but its rate details
// weren't — the form then retries as an update so it never duplicates the 3PL.
export type CreateProviderState = { error?: string; savedProviderId?: string };

const UNIQUE_VIOLATION = "23505";

export async function createProvider(
  clientRequirementId: string,
  formData: FormData,
): Promise<CreateProviderState> {
  const parsed = parseProviderForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_providers")
    .insert({ three_pl_project_id: clientRequirementId, ...parsed.data })
    .select();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("createProvider unique violation:", error);
      return {
        error:
          "Only one 3PL can be marked as incumbent for this project — uncheck the existing incumbent first.",
      };
    }
    console.error("createProvider error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  const ratesSaved = await saveRateDetails(
    supabase,
    data[0].id,
    parsed.rates,
    "create",
  );
  if (!ratesSaved) {
    return {
      error: RATE_DETAILS_NOT_SAVED_ERROR,
      savedProviderId: data[0].id,
    };
  }

  redirect(`/3pl-sourcing/projects/${clientRequirementId}`);
}
