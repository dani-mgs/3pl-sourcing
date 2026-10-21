"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-staff";
import type { StaffRole } from "@/lib/auth/get-user-role";
import { todayUtc } from "@/lib/fx/server-rates";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { NOT_FOUND, OWNER_ONLY, draftError, type DraftErrorCode } from "@/lib/landed-cost/draft-errors";
import { createPayload, parseCreateWorkspace, parseDraft, savePayload, type DraftIssue } from "@/lib/landed-cost/parse-draft";

// Landed Cost workspaces: create, save a draft, delete. The browser sends
// inputs only; results are calculated on the server when the workspace is
// loaded, never accepted from the client. Ownership is enforced by RLS (only
// the owner or an admin writes); it's also checked here to say so plainly.

export type ActionError = { ok: false; code: DraftErrorCode | "unavailable"; error: string; issues?: DraftIssue[] };
export type CreateWorkspaceState = { ok: true; workspaceId: string } | ActionError;
export type SaveDraftState =
  | { ok: true; updatedAt: string; ids: { skuLines: Record<string, string>; scenarios: Record<string, string> } }
  | ActionError;
export type DeleteWorkspaceState = { ok: true } | ActionError;

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SIGN_IN = "Your session has expired. Sign in again.";
const UNEXPECTED = "Something went wrong. Try again.";

const fail = (code: ActionError["code"], error: string, issues?: DraftIssue[]): ActionError => ({ ok: false, code, error, issues });
// Behind LANDED_COST_ENABLED (feature-flag.ts): off, every action refuses
// right after the staff check, before reading anything.
const unavailable = () => fail("unavailable", "Landed Cost isn't available yet.");

// updated_at exactly as the database returned it (microseconds and offset):
// passed back as text and compared in SQL as timestamptz, never via Date.
const timestampText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/);

const saveInputSchema = z.object({ workspaceId: z.uuid(), expectedUpdatedAt: timestampText, draft: z.unknown() });
const deleteInputSchema = z.object({ workspaceId: z.uuid() });

const saveResultSchema = z.object({
  updated_at: z.string(),
  sku_lines: z.record(z.string(), z.uuid()),
  scenarios: z.record(z.string(), z.uuid()),
});

async function signedInUser(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// The owner or an admin may write; anyone else gets a plain answer before
// anything is sent (RLS refuses them as well).
async function checkCanEdit(supabase: Supabase, workspaceId: string, userId: string, role: StaffRole): Promise<ActionError | null> {
  const { data, error } = await supabase.from("landed_cost_workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
  if (error) {
    console.error("landed cost access check error:", error);
    return fail("failed", UNEXPECTED);
  }
  if (!data) return fail("not_found", NOT_FOUND);
  if (data.owner_id !== userId && role !== "admin") return fail("forbidden", OWNER_ONLY);
  return null;
}

export async function createWorkspaceAction(input: unknown): Promise<CreateWorkspaceState> {
  await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const supabase = await createClient();
  if (!(await signedInUser(supabase))) return fail("forbidden", SIGN_IN);

  const parsed = parseCreateWorkspace(input, todayUtc());
  if (!parsed.ok) return fail("invalid", parsed.error, parsed.issues);

  const { data, error } = await supabase.rpc("create_landed_cost_workspace", { p_payload: createPayload(parsed.data) });
  if (error || typeof data !== "string") {
    console.error("createWorkspaceAction error:", error);
    const mapped = draftError(error ?? {});
    return fail(mapped.code, mapped.message);
  }
  revalidatePath("/landed-cost");
  return { ok: true, workspaceId: data };
}

// Saves the whole draft in one transaction. Refused, with nothing written,
// when the workspace changed since `expectedUpdatedAt` was read.
export async function saveDraftAction(input: unknown): Promise<SaveDraftState> {
  const role = await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);

  const request = saveInputSchema.safeParse(input);
  if (!request.success) return fail("invalid", "Reload the workspace and try again.");
  const draft = parseDraft(request.data.draft);
  if (!draft.ok) return fail("invalid", draft.error, draft.issues);

  const { workspaceId, expectedUpdatedAt } = request.data;
  const denied = await checkCanEdit(supabase, workspaceId, userId, role);
  if (denied) return denied;

  const { data, error } = await supabase.rpc("save_landed_cost_draft", {
    p_workspace_id: workspaceId,
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: savePayload(draft.data),
  });
  if (error) {
    if (error.code !== "LC409") console.error("saveDraftAction error:", error);
    const mapped = draftError(error);
    return fail(mapped.code, mapped.message);
  }
  const result = saveResultSchema.safeParse(data);
  if (!result.success) {
    console.error("saveDraftAction: unexpected result", result.error.issues.slice(0, 3));
    return fail("failed", UNEXPECTED);
  }
  revalidatePath(`/landed-cost/${workspaceId}`);
  return {
    ok: true,
    updatedAt: result.data.updated_at,
    ids: { skuLines: result.data.sku_lines, scenarios: result.data.scenarios },
  };
}

// Deletes the workspace and, by cascade, everything in it.
export async function deleteWorkspaceAction(input: unknown): Promise<DeleteWorkspaceState> {
  const role = await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);

  const request = deleteInputSchema.safeParse(input);
  if (!request.success) return fail("not_found", NOT_FOUND);
  const { workspaceId } = request.data;
  const denied = await checkCanEdit(supabase, workspaceId, userId, role);
  if (denied) return denied;

  const { error, count } = await supabase.from("landed_cost_workspaces").delete({ count: "exact" }).eq("id", workspaceId);
  if (error) {
    console.error("deleteWorkspaceAction error:", error);
    return fail("failed", "The workspace couldn't be deleted right now. Try again.");
  }
  // RLS hides a row the caller may not delete; the check above makes that a race.
  if (count === 0) return fail("forbidden", OWNER_ONLY);
  revalidatePath("/landed-cost");
  return { ok: true };
}
