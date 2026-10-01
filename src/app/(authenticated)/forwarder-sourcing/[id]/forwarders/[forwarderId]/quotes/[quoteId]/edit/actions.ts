"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { parseQuoteForm } from "@/lib/forwarder/parse-quote-form";
import { withVerifiedRateProvenance } from "@/lib/fx/server-rates";
import type { SavedRate } from "@/lib/fx/rate-provenance";

export type SaveQuoteState = { error?: string };

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const uuid = z.string().uuid();

export async function updateQuote(
  projectId: string,
  forwarderId: string,
  quoteId: string,
  formData: FormData,
): Promise<SaveQuoteState> {
  if (
    !uuid.safeParse(projectId).success ||
    !uuid.safeParse(forwarderId).success ||
    !uuid.safeParse(quoteId).success
  ) {
    return { error: NO_PERMISSION };
  }

  const { canWrite } = await getOwnershipContext(projectId, "forwarder_projects");
  if (!canWrite) {
    return { error: NO_PERMISSION };
  }

  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // The saved rate, so an unchanged rate keeps its original source and date.
  const { data: existing } = await supabase
    .from("forwarder_quotes")
    .select("original_currency, exchange_rate_to_usd, exchange_rate_source, exchange_rate_date")
    .eq("id", quoteId)
    .eq("forwarder_id", forwarderId)
    .maybeSingle();
  if (!existing) {
    return { error: NO_PERMISSION };
  }
  const quote = await withVerifiedRateProvenance(supabase, parsed.data, {
    ...existing,
    exchange_rate_to_usd: Number(existing.exchange_rate_to_usd),
  } as SavedRate);

  const { data, error } = await supabase
    .from("forwarder_quotes")
    .update(quote)
    .eq("id", quoteId)
    // Belt and braces: the row must also belong to this forwarder, so an id
    // for a quote on a different forwarder can never be edited this way.
    .eq("forwarder_id", forwarderId)
    .select("id");

  if (error) {
    console.error("updateQuote error:", error);
    return { error: UNEXPECTED };
  }
  if (!data || data.length === 0) {
    return { error: NO_PERMISSION };
  }

  revalidatePath(`/forwarder-sourcing/${projectId}`);
  redirect(`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}`);
}
