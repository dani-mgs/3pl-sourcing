"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const NO_PERMISSION = "You don't have permission to delete this estimate.";
const UNEXPECTED = "An unexpected error occurred.";

// The owner or an admin can delete a saved estimate (RLS enforces it; a
// delete that matches no row means the user wasn't allowed).
export async function deleteEstimate(estimateId: string): Promise<{ error?: string }> {
  if (!z.string().uuid().safeParse(estimateId).success) return { error: NO_PERMISSION };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NO_PERMISSION };

  const { data, error } = await supabase.from("duty_estimates").delete().eq("id", estimateId).select("id");
  if (error) {
    console.error("deleteEstimate error:", error);
    return { error: UNEXPECTED };
  }
  if (!data || data.length === 0) return { error: NO_PERMISSION };

  revalidatePath("/tariff-calculator");
  redirect("/tariff-calculator");
}
