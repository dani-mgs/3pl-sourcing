"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";

export type SaveClientRequirementsState = {
  error?: string;
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
  const clientName = formData.get("client_name") as string;
  if (!clientName?.trim()) {
    return { error: "Client name is required." };
  }

  const { canWrite } = await getOwnershipContext(clientRequirementId);
  if (!canWrite) {
    return { error: "You don't have permission to make this change." };
  }

  const supabase = await createClient();

  const payload = {
    client_name: clientName,
    business_model: optionalText(formData, "business_model"),
    target_geography: optionalText(formData, "target_geography"),
    avg_monthly_orders: optionalInt(formData, "avg_monthly_orders"),
    peak_monthly_orders: optionalInt(formData, "peak_monthly_orders"),
    latest_month_orders: optionalInt(formData, "latest_month_orders"),
    avg_monthly_units: optionalInt(formData, "avg_monthly_units"),
    peak_monthly_units: optionalInt(formData, "peak_monthly_units"),
    benchmark_period: optionalText(formData, "benchmark_period"),
    core_cost_categories: optionalText(formData, "core_cost_categories"),
    key_capability_needs: optionalText(formData, "key_capability_needs"),
    main_decision_focus: optionalText(formData, "main_decision_focus"),
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

  redirect(`/projects/${clientRequirementId}/info`);
}
