"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { parseRequestForm } from "@/lib/client-requests/input";
import { REQUEST_ERROR_FALLBACK, REQUEST_ERRORS, SENT_OK } from "@/lib/client-requests/text";

// Approve, request changes, ask a question, ask for an introduction (paid
// Market Report) or ask about the Market Report (free plan). The database
// functions decide everything that matters: the client, the author, the
// time, whether the update or report is still the latest, the plan, the rate
// caps and the must-change-password rule. Errors stay generic.

export type RequestResult = { ok: string } | { error: string };

export async function submitClientRequest(formData: FormData): Promise<RequestResult> {
  const user = await requireClient();
  // The proxy already keeps these users on the change-password page; the
  // database refuses too.
  if (user.mustChangePassword) return { error: REQUEST_ERRORS.CQ403 };
  const input = parseRequestForm(formData);
  if (!input) return { error: REQUEST_ERRORS.CQ422 };

  const supabase = await createClient();
  const { error } =
    input.kind === "introduction"
      ? await supabase.rpc("submit_client_introduction", {
          p_engagement_key: input.engagementKey,
          p_label: input.label,
          p_message: input.message,
          p_wants_call: input.wantsCall,
        })
      : input.kind === "report_interest"
        ? await supabase.rpc("submit_market_report_interest", { p_message: input.message, p_wants_call: input.wantsCall })
        : await supabase.rpc("submit_client_request", {
            p_kind: input.kind,
            p_engagement_key: input.engagementKey,
            p_update_key: input.kind === "question" ? null : input.updateKey,
            p_message: input.message,
            p_wants_call: input.kind === "question" ? input.wantsCall : false,
          });
  if (error) {
    const known = REQUEST_ERRORS[error.code ?? ""];
    if (!known) console.error(`client request (${input.kind}) failed:`, error.code);
    return { error: known ?? REQUEST_ERROR_FALLBACK };
  }
  revalidatePath("/portal");
  revalidatePath("/portal/market-report");
  return { ok: SENT_OK[input.kind] };
}
