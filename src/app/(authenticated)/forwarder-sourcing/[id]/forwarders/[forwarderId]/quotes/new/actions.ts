"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { parseQuoteForm } from "@/lib/forwarder/parse-quote-form";
import { withVerifiedRateProvenance } from "@/lib/fx/server-rates";

export type SaveQuoteState = { error?: string };

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const uuid = z.string().uuid();

export async function createQuote(
  projectId: string,
  forwarderId: string,
  formData: FormData,
): Promise<SaveQuoteState> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(forwarderId).success) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const supabase = await createClient();

  // forwarder_quotes has no project_id of its own — ownership only exists
  // through forwarder -> forwarder_project, so confirm this forwarder
  // actually belongs to this project before attaching a quote to it.
  const { data: forwarder } = await supabase
    .from("forwarders")
    .select("id")
    .eq("id", forwarderId)
    .eq("forwarder_project_id", projectId)
    .maybeSingle();
  if (!forwarder) {
    return { error: NO_PERMISSION };
  }

  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const quote = await withVerifiedRateProvenance(supabase, parsed.data, null);

  const { data, error } = await supabase
    .from("forwarder_quotes")
    .insert({ ...quote, forwarder_id: forwarderId })
    .select("id")
    .single();

  if (error) {
    console.error("createQuote insert error:", error);
    return { error: UNEXPECTED };
  }
  if (!data) {
    return { error: NO_PERMISSION };
  }

  revalidatePath(`/forwarder-sourcing/${projectId}`);
  redirect(`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}`);
}
