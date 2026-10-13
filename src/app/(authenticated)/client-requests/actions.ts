"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { replyInputSchema } from "@/lib/client-requests/input";
import { STAFF_REPLY_ERRORS } from "@/lib/client-requests/text";

// The client requests inbox. Every write is a database function that checks
// the caller itself: seen and reply need the project's owner or an admin,
// withdrawing a reply needs an admin.

export type InboxResult = { ok: string } | { error: string };

function refresh() {
  revalidatePath("/client-requests");
  // The header badge is on every staff page.
  revalidatePath("/", "layout");
}

function failure(code: string | undefined, what: string): InboxResult {
  const known = STAFF_REPLY_ERRORS[code ?? ""];
  if (!known) console.error(`${what} failed:`, code);
  return { error: known ?? "That didn't work. Try again." };
}

// Called when the owner or an admin opens a request (an explicit click in
// the inbox), never while a page renders.
export async function markClientRequestSeen(requestId: string): Promise<InboxResult> {
  await requireStaff();
  const id = z.uuid().safeParse(requestId);
  if (!id.success) return { error: "This request couldn't be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_client_request_seen", { p_request_id: id.data });
  if (error) return failure(error.code, "mark_client_request_seen");
  if (data === true) refresh();
  return { ok: data === true ? "Marked as seen." : "Not marked: only the project's owner or an admin marks requests as seen." };
}

export async function replyToClientRequest(formData: FormData): Promise<InboxResult> {
  await requireStaff();
  const parsed = replyInputSchema.safeParse({ requestId: formData.get("requestId"), reply: formData.get("reply") });
  if (!parsed.success) return { error: STAFF_REPLY_ERRORS.CQ422 };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_to_client_request", {
    p_request_id: parsed.data.requestId,
    p_reply: parsed.data.reply,
  });
  if (error) return failure(error.code, "reply_to_client_request");
  refresh();
  return { ok: "Reply sent. The client sees it in their portal." };
}

// Admins only (the database checks too).
export async function withdrawClientRequestReply(requestId: string): Promise<InboxResult> {
  const role = await requireStaff();
  if (role !== "admin") return { error: "Only an admin can withdraw a reply." };
  const id = z.uuid().safeParse(requestId);
  if (!id.success) return { error: "This request couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_client_request_reply", { p_request_id: id.data });
  if (error) return failure(error.code, "withdraw_client_request_reply");
  refresh();
  return { ok: "Reply withdrawn. The client sees that a new one is coming." };
}
