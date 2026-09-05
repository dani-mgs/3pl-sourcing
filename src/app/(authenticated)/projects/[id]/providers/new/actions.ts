"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateProviderState = { error?: string };

const UNIQUE_VIOLATION = "23505";

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

export async function createProvider(
  clientRequirementId: string,
  formData: FormData,
): Promise<CreateProviderState> {
  const websiteInput = formData.get("website") as string;
  const website =
    websiteInput && !/^https?:\/\//i.test(websiteInput)
      ? `https://${websiteInput}`
      : websiteInput || null;
  const phoneCountry = (formData.get("phone_country") as string) || "+1";
  const phoneNumber = (formData.get("phone_number") as string) || "";
  const phone = phoneNumber ? `${phoneCountry} ${phoneNumber}` : null;

  const supabase = await createClient();

  const { data, error } = await supabase.from("three_pl_providers").insert({
    client_requirement_id: clientRequirementId,
    company_name: formData.get("company_name") as string,
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
    lot_batch_expiry_tracking: checkbox(
      formData,
      "lot_batch_expiry_tracking",
    ),
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
    storage_cost: optionalNumber(formData, "storage_cost"),
    pick_pack_cost: optionalNumber(formData, "pick_pack_cost"),
    receiving_cost: optionalNumber(formData, "receiving_cost"),
    returns_cost: optionalNumber(formData, "returns_cost"),
    status: formData.get("status") as string,
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
  }).select();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.error("createProvider unique violation:", error);
      return {
        error:
          "Only one 3PL can be marked as incumbent for this client — uncheck the existing incumbent first.",
      };
    }
    console.error("createProvider error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  redirect(`/projects/${clientRequirementId}/providers`);
}
