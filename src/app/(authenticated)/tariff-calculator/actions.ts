"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseEstimateForm } from "@/lib/tariff/parse-estimate-form";
import { buildEstimate, estimateToRow, type EstimateResult } from "@/lib/tariff/server-estimate";

export type PreviewState = { result?: EstimateResult; error?: string };
export type SaveState = { error?: string };

const SIGN_IN = "Your session has expired. Sign in again.";
const UNEXPECTED = "An unexpected error occurred.";

// Calculates without saving. Any signed-in user may estimate; reads only.
export async function previewEstimate(formData: FormData): Promise<PreviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGN_IN };

  const parsed = parseEstimateForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const built = await buildEstimate(supabase, parsed.data);
  return built.ok ? { result: built.estimate } : { error: built.error };
}

// Recalculates on the server (never trusting the preview) and saves a locked
// estimate owned by the signed-in user. Flagged for rate-limiting review with
// the other inserting actions (docs/SECURITY.md).
export async function saveEstimate(formData: FormData): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SIGN_IN };

  const parsed = parseEstimateForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const built = await buildEstimate(supabase, parsed.data);
  if (!built.ok) return { error: built.error };

  const { data, error } = await supabase
    .from("duty_estimates")
    .insert(estimateToRow(built.estimate, parsed.data.label))
    .select("id")
    .single();
  if (error || !data) {
    console.error("saveEstimate insert error:", error);
    return { error: UNEXPECTED };
  }

  revalidatePath("/tariff-calculator");
  redirect(`/tariff-calculator/estimates/${data.id}`);
}
