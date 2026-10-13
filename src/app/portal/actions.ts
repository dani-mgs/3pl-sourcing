"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { parseRequestForm } from "@/lib/client-requests/input";
import { REQUEST_ERROR_FALLBACK, REQUEST_ERRORS, SENT_OK } from "@/lib/client-requests/text";

// Approve, request changes, ask a question. The database function
// (submit_client_request) decides everything that matters: the client, the
// author, the time, whether the update is still the latest, the rate caps
// and the must-change-password rule. Errors stay generic.

export type RequestResult = { ok: string } | { error: string };

export async function submitClientRequest(formData: FormData): Promise<RequestResult> {
  const user = await requireClient();
  // The proxy already keeps these users on the change-password page; the
  // database refuses too.
  if (user.mustChangePassword) return { error: REQUEST_ERRORS.CQ403 };
  const input = parseRequestForm(formData);
  if (!input) return { error: REQUEST_ERRORS.CQ422 };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_client_request", {
    p_kind: input.kind,
    p_engagement_key: input.engagementKey,
    p_update_key: input.kind === "question" ? null : input.updateKey,
    p_message: input.message,
    p_wants_call: input.kind === "question" ? input.wantsCall : false,
  });
  if (error) {
    const known = REQUEST_ERRORS[error.code ?? ""];
    if (!known) console.error("submit_client_request failed:", error.code);
    return { error: known ?? REQUEST_ERROR_FALLBACK };
  }
  revalidatePath("/portal");
  return { ok: SENT_OK[input.kind] };
}
