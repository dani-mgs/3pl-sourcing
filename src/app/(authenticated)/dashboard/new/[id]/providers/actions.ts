"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type QuickAddProviderState = {
  error?: string;
  provider?: {
    id: string;
    company_name: string;
    location: string | null;
    contact_person: string | null;
    status: string;
  };
};

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key) as string;
  return value ? value : null;
}

export async function quickAddProvider(
  clientRequirementId: string,
  formData: FormData,
): Promise<QuickAddProviderState> {
  const companyName = formData.get("company_name") as string;
  if (!companyName?.trim()) {
    return { error: "Company name is required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_providers")
    .insert({
      client_requirement_id: clientRequirementId,
      company_name: companyName,
      location: optionalText(formData, "location"),
      contact_person: optionalText(formData, "contact_person"),
      status: formData.get("status") as string,
    })
    .select("id, company_name, location, contact_person, status")
    .single();

  if (error) {
    console.error("quickAddProvider error:", error);
    return { error: "An unexpected error occurred." };
  }
  if (!data) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/dashboard/new/${clientRequirementId}/providers`);
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
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/dashboard/new/${clientRequirementId}/providers`);
  return {};
}
