"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { replyInputSchema } from "@/lib/client-requests/input";
import { checkIntroductionReply, introductionGuardIdentities, type LabelRow } from "@/lib/client-requests/introduction-reply-guard";
import { introductionReplyIdentifies, STAFF_REPLY_ERRORS, WITHDRAW_ERRORS } from "@/lib/client-requests/text";
import { toIdentities } from "@/lib/client-updates/load-market-report-source";

// The client requests inbox. Every write is a database function that checks
// the caller itself: seen and reply need the project's owner or an admin
// (Market Report interest: an admin or the owner of any of the client's
// projects), withdrawing a reply needs an admin.

export type InboxResult = { ok: string } | { error: string };

function refresh() {
  revalidatePath("/client-requests");
  // The header badge is on every staff page.
  revalidatePath("/", "layout");
}

function failure(code: string | undefined, what: string, errors = STAFF_REPLY_ERRORS): InboxResult {
  const known = errors[code ?? ""] ?? STAFF_REPLY_ERRORS[code ?? ""];
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

  // An introduction: the reply may not identify the partner behind the letter
  // (or any other lettered partner of the report). Staff-only error.
  const { data: request } = await supabase
    .from("client_requests")
    .select("kind, forwarder_project_id, partner_label")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (request?.kind === "introduction" && request.forwarder_project_id && request.partner_label) {
    const project = request.forwarder_project_id as string;
    const [labels, report, forwarders] = await Promise.all([
      supabase.from("market_report_partner_labels").select("forwarder_id, label").eq("forwarder_project_id", project),
      supabase
        .from("client_market_reports")
        .select("payload")
        .eq("forwarder_project_id", project)
        .order("published_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("forwarders").select("id, company_name, website, headquarters, email, contact_person").eq("forwarder_project_id", project),
    ]);
    if (labels.error || report.error || forwarders.error) {
      console.error("introduction reply check failed:", labels.error?.code ?? report.error?.code ?? forwarders.error?.code);
      return { error: "The reply couldn't be checked. Try again." };
    }
    const identities = introductionGuardIdentities({
      label: request.partner_label as string,
      latestPayload: report.data?.payload ?? null,
      labels: (labels.data ?? []) as LabelRow[],
      forwarders: toIdentities((forwarders.data ?? []) as Record<string, unknown>[]),
    });
    const hit = checkIntroductionReply(parsed.data.reply, identities);
    if (hit) return { error: introductionReplyIdentifies(hit.partnerName, hit.token, `Partner ${request.partner_label}`) };
  }

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
  if (error) return failure(error.code, "withdraw_client_request_reply", WITHDRAW_ERRORS);
  refresh();
  return { ok: "Reply withdrawn. The client sees that a new one is coming." };
}
