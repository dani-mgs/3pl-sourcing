"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-staff";
import { isForwarderAuditEnabled } from "@/lib/forwarder-audit/feature-flag";
import { blankInputs, parseInputs, type InputIssue } from "@/lib/forwarder-audit/input-schema";
import { NOT_FOUND } from "@/lib/forwarder-audit/server-audit";

// Forwarder Audits: create, save and delete. The browser sends inputs only;
// the status and findings are calculated from them whenever an audit is
// shown, never accepted from the client. Ownership is enforced by RLS (only
// the owner or an admin writes); it's also checked here to say so plainly.

export type AuditActionError = { ok: false; code: "unavailable" | "invalid" | "forbidden" | "not_found" | "stale" | "failed"; error: string; issues?: InputIssue[] };
export type CreateAuditState = { ok: true; auditId: string } | AuditActionError;
export type SaveAuditState = { ok: true; updatedAt: string } | AuditActionError;
export type DeleteAuditState = { ok: true } | AuditActionError;

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SIGN_IN = "Your session has expired. Sign in again.";
const UNEXPECTED = "Something went wrong. Try again.";
const OWNER_ONLY = "Only the audit's owner or an admin can change it.";
const STALE = "This audit changed since you opened it. Reload it to see the latest version; your edits here aren't saved.";

const fail = (code: AuditActionError["code"], error: string, issues?: InputIssue[]): AuditActionError => ({ ok: false, code, error, issues });
// Behind FORWARDER_AUDIT_ENABLED (feature-flag.ts): off, every action refuses
// right after the staff check, before reading anything.
const unavailable = () => fail("unavailable", "Forwarder Audit isn't available yet.");

// updated_at exactly as the database returned it, passed back as text.
const timestampText = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/);
const saveSchema = z.object({ auditId: z.uuid(), expectedUpdatedAt: timestampText, inputs: z.unknown() });
const idSchema = z.object({ auditId: z.uuid() });

async function signedInUser(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type Access = { ok: true; updatedAt: string } | AuditActionError;

// Who owns the audit, and is the caller allowed to change it?
async function checkAccess(supabase: Supabase, auditId: string, userId: string, role: string): Promise<Access> {
  const { data, error } = await supabase.from("forwarder_audits").select("owner_id, updated_at").eq("id", auditId).maybeSingle();
  if (error) {
    console.error("forwarder audit access check error:", error);
    return fail("failed", UNEXPECTED);
  }
  if (!data) return fail("not_found", NOT_FOUND);
  if (data.owner_id !== userId && role !== "admin") return fail("forbidden", OWNER_ONLY);
  return { ok: true, updatedAt: data.updated_at as string };
}

export async function createAuditAction(): Promise<CreateAuditState> {
  await requireStaff();
  if (!isForwarderAuditEnabled()) return unavailable();
  const supabase = await createClient();
  if (!(await signedInUser(supabase))) return fail("forbidden", SIGN_IN);

  const { data, error } = await supabase.from("forwarder_audits").insert({ inputs: blankInputs() }).select("id").single();
  if (error || !data) {
    console.error("createAuditAction error:", error);
    return fail("failed", UNEXPECTED);
  }
  revalidatePath("/forwarder-audit");
  return { ok: true, auditId: data.id as string };
}

export async function saveAuditAction(input: unknown): Promise<SaveAuditState> {
  const role = await requireStaff();
  if (!isForwarderAuditEnabled()) return unavailable();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "This audit couldn't be saved: the request wasn't understood. Reload and try again.");
  const checked = parseInputs(parsed.data.inputs);
  if (!checked.ok) return fail("invalid", "Fix the highlighted values, then save again.", checked.issues);

  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);
  const access = await checkAccess(supabase, parsed.data.auditId, userId, role);
  if (!access.ok) return access;

  // The stale check is part of the write: it only matches the row as it was read.
  const { data, error } = await supabase
    .from("forwarder_audits")
    .update({ inputs: checked.inputs })
    .eq("id", parsed.data.auditId)
    .eq("updated_at", parsed.data.expectedUpdatedAt)
    .select("id, updated_at");
  if (error) {
    console.error("saveAuditAction error:", error);
    return fail("failed", UNEXPECTED);
  }
  // RLS or the stale check refused: no row, no error.
  if (!data || data.length !== 1) return fail("stale", STALE);
  revalidatePath("/forwarder-audit");
  revalidatePath(`/forwarder-audit/${parsed.data.auditId}`);
  return { ok: true, updatedAt: data[0].updated_at as string };
}

export async function deleteAuditAction(input: unknown): Promise<DeleteAuditState> {
  const role = await requireStaff();
  if (!isForwarderAuditEnabled()) return unavailable();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("not_found", NOT_FOUND);

  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);
  const access = await checkAccess(supabase, parsed.data.auditId, userId, role);
  if (!access.ok) return access;

  const { data, error } = await supabase.from("forwarder_audits").delete().eq("id", parsed.data.auditId).select("id");
  if (error) {
    console.error("deleteAuditAction error:", error);
    return fail("failed", UNEXPECTED);
  }
  if (!data || data.length !== 1) return fail("forbidden", OWNER_ONLY);
  revalidatePath("/forwarder-audit");
  return { ok: true };
}
