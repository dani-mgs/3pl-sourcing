"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveRateDetailsState = { error?: string; success?: boolean };

function optionalNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key) as string;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function saveRateDetails(
  projectId: string,
  providerId: string,
  formData: FormData,
): Promise<SaveRateDetailsState> {
  const supabase = await createClient();

  const payload = {
    provider_id: providerId,
    receiving_rate: optionalNumber(formData, "receiving_rate"),
    storage_rate: optionalNumber(formData, "storage_rate"),
    fulfillment_rate: optionalNumber(formData, "fulfillment_rate"),
    dispatch_rate: optionalNumber(formData, "dispatch_rate"),
    adhoc_kitting_rate: optionalNumber(formData, "adhoc_kitting_rate"),
    adhoc_labelling_rate: optionalNumber(formData, "adhoc_labelling_rate"),
    returns_rate: optionalNumber(formData, "returns_rate"),
    annual_inv_count_rate: optionalNumber(formData, "annual_inv_count_rate"),
    cycle_count_rate: optionalNumber(formData, "cycle_count_rate"),
    inv_count_on_request_rate: optionalNumber(
      formData,
      "inv_count_on_request_rate",
    ),
    setup_rate: optionalNumber(formData, "setup_rate"),
    onboarding_fee: optionalNumber(formData, "onboarding_fee"),
    security_deposit: optionalNumber(formData, "security_deposit"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("rate_details")
    .upsert(payload, { onConflict: "provider_id" });

  if (error) {
    console.error("saveRateDetails error:", error);
    return { error: "An unexpected error occurred." };
  }

  revalidatePath(`/projects/${projectId}/providers/${providerId}/rates`);
  return { success: true };
}
