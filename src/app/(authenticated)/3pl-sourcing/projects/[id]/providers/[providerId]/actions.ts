"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { explainEmptyDelete } from "@/lib/delete-errors";

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
    console.error("deleteProvider error:", error);
    return { error: "An unexpected error occurred." };
  }

  if (!data || data.length === 0) {
    return { error: await explainEmptyDelete(supabase, "three_pl_providers", providerId) };
  }

  redirect(`/3pl-sourcing/projects/${projectId}`);
}
