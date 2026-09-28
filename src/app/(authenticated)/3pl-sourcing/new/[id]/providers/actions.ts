"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { explainEmptyDelete } from "@/lib/delete-errors";
import {
  RATE_DETAILS_NOT_SAVED_ERROR,
  rateDetailsFromForm,
  saveRateDetails,
} from "@/lib/rate-details";

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

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key) as string;
  return value ? value : null;
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key) as string;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "true";
}

export async function quickAddProvider(
  clientRequirementId: string,
  formData: FormData,
  existingProviderId?: string,
): Promise<QuickAddProviderState> {
  const companyName = formData.get("company_name") as string;
  if (!companyName?.trim()) {
    return { error: "Company name is required." };
  }

  const websiteInput = formData.get("website") as string;
  const website =
    websiteInput && !/^https?:\/\//i.test(websiteInput)
      ? `https://${websiteInput}`
      : websiteInput || null;
  const phoneCountry = (formData.get("phone_country") as string) || "+1";
  const phoneNumber = (formData.get("phone_number") as string) || "";
  const phone = phoneNumber ? `${phoneCountry} ${phoneNumber}` : null;

  const supabase = await createClient();

  const fields = {
    company_name: companyName,
    provider_type: optionalText(formData, "provider_type"),
    website,
    location: optionalText(formData, "location"),
    footprint_source: optionalText(formData, "footprint_source"),
    contact_person: optionalText(formData, "contact_person"),
    email: optionalText(formData, "email"),
    phone,
    receiving: checkbox(formData, "receiving"),
    storage: checkbox(formData, "storage"),
    fulfillment: checkbox(formData, "fulfillment"),
    dispatch: checkbox(formData, "dispatch"),
    adhoc_kitting_bundling: checkbox(formData, "adhoc_kitting_bundling"),
    adhoc_labelling: checkbox(formData, "adhoc_labelling"),
    returns: checkbox(formData, "returns"),
    annual_inventory_count: checkbox(formData, "annual_inventory_count"),
    cycle_count: checkbox(formData, "cycle_count"),
    inventory_count_on_request: checkbox(
      formData,
      "inventory_count_on_request",
    ),
    one_time_system_setup: checkbox(formData, "one_time_system_setup"),
    lot_batch_expiry_tracking: checkbox(formData, "lot_batch_expiry_tracking"),
    temp_controlled_storage: checkbox(formData, "temp_controlled_storage"),
    retail_edi_compliance: checkbox(formData, "retail_edi_compliance"),
    cross_docking: checkbox(formData, "cross_docking"),
    b2b: checkbox(formData, "b2b"),
    b2c: checkbox(formData, "b2c"),
    onboarding_period_months: optionalNumber(
      formData,
      "onboarding_period_months",
    ),
    virtual_tour_url: optionalText(formData, "virtual_tour_url"),
    billing_terms: optionalText(formData, "billing_terms"),
    other_specialization: optionalText(formData, "other_specialization"),
    is_incumbent: checkbox(formData, "is_incumbent"),
    currency: (formData.get("currency") as string) || "USD",
    storage_cost: optionalNumber(formData, "storage_cost"),
    pick_pack_cost: optionalNumber(formData, "pick_pack_cost"),
    receiving_cost: optionalNumber(formData, "receiving_cost"),
    returns_cost: optionalNumber(formData, "returns_cost"),
    system_setup_cost: optionalNumber(formData, "system_setup_cost"),
    inventory_on_request_cost: optionalNumber(
      formData,
      "inventory_on_request_cost",
    ),
    adhoc_bundling_kitting_cost: optionalNumber(
      formData,
      "adhoc_bundling_kitting_cost",
    ),
    adhoc_labelling_cost: optionalNumber(formData, "adhoc_labelling_cost"),
    b2b_pick_pack_cost: optionalNumber(formData, "b2b_pick_pack_cost"),
    status: (formData.get("status") as string) || "Potential / Not Contacted",
    assessment_status: optionalText(formData, "assessment_status"),
    key_strength: optionalText(formData, "key_strength"),
    key_weakness_risk: optionalText(formData, "key_weakness_risk"),
    important_assumption: optionalText(formData, "important_assumption"),
    overall_assessment: optionalText(formData, "overall_assessment"),
    client_decision: optionalText(formData, "client_decision"),
    source_basis: optionalText(formData, "source_basis"),
    next_action: optionalText(formData, "next_action"),
    key_notes: optionalText(formData, "key_notes"),
    notes: optionalText(formData, "notes"),
  };

  const { data, error } = existingProviderId
    ? await supabase
        .from("three_pl_providers")
        .update(fields)
        .eq("id", existingProviderId)
        .select("id, company_name, location, contact_person, status")
        .maybeSingle()
    : await supabase
        .from("three_pl_providers")
        .insert({ three_pl_project_id: clientRequirementId, ...fields })
        .select("id, company_name, location, contact_person, status")
        .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("quickAddProvider unique violation:", error);
      return {
        error:
          "Only one 3PL can be marked as incumbent for this client — uncheck the existing incumbent first.",
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
    rateDetailsFromForm(formData),
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
