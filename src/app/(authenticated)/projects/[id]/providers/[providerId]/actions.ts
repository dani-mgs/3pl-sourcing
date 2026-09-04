"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DeleteProviderState = { error?: string };

export async function deleteProvider(
  projectId: string,
  providerId: string,
): Promise<DeleteProviderState> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("three_pl_providers")
    .delete()
    .eq("id", providerId)
    .select();

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "You don't have permission to make this change." };
  }

  redirect(`/projects/${projectId}/providers`);
}
