"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaveClientIntakeState = { error?: string };

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

export async function saveClientIntake(
  clientRequirementId: string | null,
  formData: FormData,
): Promise<SaveClientIntakeState> {
  const supabase = await createClient();

  const clientName = formData.get("client_name") as string;
  if (!clientName?.trim()) {
    return { error: "Client name is required." };
  }

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

  const intent = formData.get("intent") as string;
  let id = clientRequirementId;

  if (id) {
    const { data, error } = await supabase
      .from("client_requirements")
      .update(payload)
      .eq("id", id)
      .select();

    if (error) {
      console.error("saveClientIntake update error:", error);
      return { error: "An unexpected error occurred." };
    }
    if (!data || data.length === 0) {
      return { error: "You don't have permission to make this change." };
    }
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "You must be signed in to create a client." };
    }

    const { data, error } = await supabase
      .from("client_requirements")
      .insert({ ...payload, owner_id: user.id, status: "Active" })
      .select("id")
      .single();

    if (error) {
      console.error("saveClientIntake insert error:", error);
      return { error: "An unexpected error occurred." };
    }
    if (!data) {
      return { error: "You don't have permission to make this change." };
    }
    id = data.id;
  }

  if (intent === "draft") {
    redirect("/dashboard");
  }
  redirect(`/dashboard/new/${id}/providers`);
}
