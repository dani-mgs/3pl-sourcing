"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DeleteProviderState = { error?: string };

export async function deleteProvider(
  projectId: string,
  providerId: string,
): Promise<DeleteProviderState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("three_pl_providers")
    .delete()
    .eq("id", providerId);

  if (error) {
    return { error: error.message };
  }

  redirect(`/projects/${projectId}/providers`);
}
