"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveClientRequirementsState = {
  error?: string;
  success?: boolean;
};

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key) as string;
  return value ? value : null;
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = formData.get(key) as string;
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function updateClientRequirements(
  clientRequirementId: string,
  formData: FormData,
): Promise<SaveClientRequirementsState> {
  const supabase = await createClient();

  const payload = {
    current_incumbent_3pl: optionalText(formData, "current_incumbent_3pl"),
    target_geography: optionalText(formData, "target_geography"),
    benchmark_period: optionalText(formData, "benchmark_period"),
    avg_monthly_orders: optionalInt(formData, "avg_monthly_orders"),
    peak_monthly_orders: optionalInt(formData, "peak_monthly_orders"),
    latest_month_orders: optionalInt(formData, "latest_month_orders"),
    avg_monthly_units: optionalInt(formData, "avg_monthly_units"),
    peak_monthly_units: optionalInt(formData, "peak_monthly_units"),
    business_model: optionalText(formData, "business_model"),
    core_cost_categories: optionalText(formData, "core_cost_categories"),
    main_decision_focus: optionalText(formData, "main_decision_focus"),
    key_capability_needs: optionalText(formData, "key_capability_needs"),
    tech_integration_requirement: optionalText(
      formData,
      "tech_integration_requirement",
    ),
    special_handling_requirement: optionalText(
      formData,
      "special_handling_requirement",
    ),
    fixed_comparison_principle: optionalText(
      formData,
      "fixed_comparison_principle",
    ),
    important_limitation: optionalText(formData, "important_limitation"),
    assumptions_data_limitations: optionalText(
      formData,
      "assumptions_data_limitations",
    ),
  };

  const { data, error } = await supabase
    .from("client_requirements")
    .update(payload)
    .eq("id", clientRequirementId)
    .select();

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  revalidatePath(`/projects/${clientRequirementId}/info`);
  return { success: true };
}
