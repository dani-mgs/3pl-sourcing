"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { explainEmptyDelete } from "@/lib/delete-errors";
import { RATE_DETAILS_NOT_SAVED_ERROR, saveRateDetails } from "@/lib/rate-details";
import { parseProviderForm } from "@/lib/three-pl/parse-provider-form";

const UNIQUE_VIOLATION = "23505";

// savedProviderId is set when the 3PL row was saved but its rate details
// weren't — the caller passes it back on retry so the 3PL is updated rather
// than inserted twice.
export type QuickAddProviderState = {
  error?: string;
  savedProviderId?: string;
  provider?: {
    id: string;
    company_name: string;
    location: string | null;
    contact_person: string | null;
    status: string;
  };
};

export async function quickAddProvider(
  clientRequirementId: string,
  formData: FormData,
  existingProviderId?: string,
): Promise<QuickAddProviderState> {
  const parsed = parseProviderForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { data, error } = existingProviderId
    ? await supabase
        .from("three_pl_providers")
        .update(parsed.data)
        .eq("id", existingProviderId)
        .select("id, company_name, location, contact_person, status")
        .maybeSingle()
    : await supabase
        .from("three_pl_providers")
        .insert({ three_pl_project_id: clientRequirementId, ...parsed.data })
        .select("id, company_name, location, contact_person, status")
        .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("quickAddProvider unique violation:", error);
      return {
        error:
          "Only one 3PL can be marked as incumbent for this project — uncheck the existing incumbent first.",
      };
    }
    console.error("quickAddProvider error:", error);
    return { error: "An unexpected error occurred." };
  }
  if (!data) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/3pl-sourcing/new/${clientRequirementId}/providers`);
  revalidatePath(`/3pl-sourcing/new/${clientRequirementId}/review`);

  const ratesSaved = await saveRateDetails(
    supabase,
    data.id,
    parsed.rates,
    existingProviderId ? "update" : "create",
  );
  if (!ratesSaved) {
    return {
      error: RATE_DETAILS_NOT_SAVED_ERROR,
      provider: data,
      savedProviderId: data.id,
    };
  }

  return { provider: data };
}

export type RemoveQuickAddedProviderState = { error?: string };

export async function removeQuickAddedProvider(
  clientRequirementId: string,
  providerId: string,
): Promise<RemoveQuickAddedProviderState> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_providers")
    .delete()
    .eq("id", providerId)
    .select();

  if (error) {
    console.error("removeQuickAddedProvider error:", error);
    return { error: "An unexpected error occurred." };
  }
  if (!data || data.length === 0) {
    return {
      error: await explainEmptyDelete(supabase, "three_pl_providers", providerId),
    };
  }

  revalidatePath(`/3pl-sourcing/new/${clientRequirementId}/providers`);
  revalidatePath(`/3pl-sourcing/new/${clientRequirementId}/review`);
  return {};
}
