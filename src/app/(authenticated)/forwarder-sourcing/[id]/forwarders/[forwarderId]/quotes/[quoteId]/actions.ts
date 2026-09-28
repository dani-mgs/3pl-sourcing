"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { explainEmptyDelete } from "@/lib/delete-errors";

export type DeleteQuoteState = { error?: string };

const NO_PERMISSION = "You don't have permission to make this change.";
const UNEXPECTED = "An unexpected error occurred.";
const uuid = z.string().uuid();

// Nothing else references a quote, so this is a plain single-row delete —
// no cascade concerns like deleteForwarder has.
export async function deleteQuote(
  projectId: string,
  forwarderId: string,
  quoteId: string,
): Promise<DeleteQuoteState> {
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forwarder_quotes")
    .delete()
    .eq("id", quoteId)
    .eq("forwarder_id", forwarderId)
    .select();

  if (error) {
    console.error("deleteQuote error:", error);
    return { error: UNEXPECTED };
  }

  if (!data || data.length === 0) {
    return {
      error: await explainEmptyDelete(supabase, "forwarder_quotes", quoteId),
    };
  }

  revalidatePath(`/forwarder-sourcing/${projectId}`);
  return {};
}
