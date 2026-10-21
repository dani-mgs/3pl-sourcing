"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-staff";
import type { StaffRole } from "@/lib/auth/get-user-role";
import { todayUtc } from "@/lib/fx/server-rates";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { NOT_FOUND, OWNER_ONLY, draftError, type DraftErrorCode } from "@/lib/landed-cost/draft-errors";
import { buildWorkspaceCsv, versionFilename, workspaceCsvFilename } from "@/lib/landed-cost/export-csv";
import { renderVersionPdf } from "@/lib/landed-cost/render-version-pdf";
import { loadLockedVersion } from "@/lib/landed-cost/server-snapshots";
import { loadFirstNames } from "@/lib/landed-cost/server-workspace-list";
import { buildVersionReport, describeVersion } from "@/lib/landed-cost/version-report";
import { personName } from "@/lib/tariff/fee-audit";
import { createPayload, parseCreateWorkspace, parseDraft, savePayload, type DraftIssue } from "@/lib/landed-cost/parse-draft";
import { computeWorkspaceResult } from "@/lib/landed-cost/server-compute";
import { loadWorkspace } from "@/lib/landed-cost/server-workspace";
import { lockBlocker } from "@/lib/landed-cost/lock-check";
import { buildSnapshotRow, restoreSnapshot } from "@/lib/landed-cost/snapshot-schema";
import { saveLandedCostSnapshot } from "@/lib/landed-cost/snapshot-store";
import type { WorkspaceResult } from "@/lib/landed-cost/server-compute";

// Landed Cost workspaces: create, save a draft, delete, export as CSV, and
// lock a version (or delete one). The browser sends
// inputs only; results are calculated on the server when the workspace is
// loaded, never accepted from the client. Ownership is enforced by RLS (only
// the owner or an admin writes); it's also checked here to say so plainly.

export type ActionError = { ok: false; code: DraftErrorCode | "unavailable"; error: string; issues?: DraftIssue[] };
export type CreateWorkspaceState = { ok: true; workspaceId: string } | ActionError;
export type SaveDraftState =
  | { ok: true; updatedAt: string; ids: { skuLines: Record<string, string>; scenarios: Record<string, string> } }
  | ActionError;
export type DeleteWorkspaceState = { ok: true } | ActionError;
export type ExportCsvState = { ok: true; csv: string; filename: string } | ActionError;
export type LockWorkspaceState = { ok: true; versionId: string; versionNo: number } | ActionError;
export type DeleteSnapshotState = { ok: true } | ActionError;
export type ExportVersionPdfState = { ok: true; base64: string; filename: string } | ActionError;
export type ExportVersionCsvState = { ok: true; csv: string; filename: string } | ActionError;

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
const exportInputSchema = z.object({ workspaceId: z.uuid() });
const lockInputSchema = z.object({ workspaceId: z.uuid(), expectedUpdatedAt: timestampText });
const deleteSnapshotInputSchema = z.object({ snapshotId: z.uuid() });
const exportVersionInputSchema = z.object({ snapshotId: z.uuid() });

const VERSION_NOT_FOUND = "This version doesn't exist, or you can't open it.";
const VERSION_UNREADABLE = "This version can't be exported: its stored data isn't in a form this export can read.";
const EXPORT_FAILED = "The export couldn't be built right now. Try again.";

const LOCK_STALE = "This workspace changed since you opened it. Reload it, check the result, then lock again.";
const LOCK_FAILED = "This version couldn't be locked right now. Try again.";
const LOCK_MISMATCH = "This version couldn't be locked: the result didn't match the saved workspace. Reload it and try again.";
const SNAPSHOT_NOT_FOUND = "This version doesn't exist, or you can't delete it.";
const SNAPSHOT_OWNER_ONLY = "Only the person who locked this version, the workspace's owner or an admin can delete it.";
const hasVersions = (n: number | null) =>
  n ? `This workspace has ${n} locked ${n === 1 ? "version" : "versions"}. Delete ${n === 1 ? "it" : "them"} first.` : "This workspace has locked versions. Delete them first.";

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

  // Locked versions keep their workspace (no cascade): say so before trying.
  const versions = await supabase.from("landed_cost_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (versions.error) {
    console.error("deleteWorkspaceAction versions error:", versions.error);
    return fail("failed", "The workspace couldn't be deleted right now. Try again.");
  }
  if ((versions.count ?? 0) > 0) return fail("invalid", hasVersions(versions.count));

  const { error, count } = await supabase.from("landed_cost_workspaces").delete({ count: "exact" }).eq("id", workspaceId);
  if (error?.code === "23503") return fail("invalid", hasVersions(null));
  if (error) {
    console.error("deleteWorkspaceAction error:", error);
    return fail("failed", "The workspace couldn't be deleted right now. Try again.");
  }
  // RLS hides a row the caller may not delete; the check above makes that a race.
  if (count === 0) return fail("forbidden", OWNER_ONLY);
  revalidatePath("/landed-cost");
  return { ok: true };
}

// Any staff member who can open the workspace can export it (RLS lets every
// staff role read it). Loaded and calculated here from the last save; no
// number comes from the browser.
export async function exportWorkspaceCsvAction(input: unknown): Promise<ExportCsvState> {
  await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const request = exportInputSchema.safeParse(input);
  if (!request.success) return fail("not_found", NOT_FOUND);

  const supabase = await createClient();
  const loaded = await loadWorkspace(supabase, request.data.workspaceId);
  if (!loaded.ok) return fail(loaded.code === "not_found" ? "not_found" : "failed", loaded.message);
  if (loaded.workspace.scenarios.length === 0) return fail("failed", "This workspace has no scenario, so there's nothing to export.");
  try {
    const result = await computeWorkspaceResult(supabase, loaded.workspace, todayUtc());
    return {
      ok: true,
      csv: buildWorkspaceCsv(loaded.workspace, result),
      filename: workspaceCsvFilename(loaded.workspace.name, result.calculatedOn),
    };
  } catch (error) {
    console.error("exportWorkspaceCsvAction error:", error);
    return fail("failed", "The export couldn't be built right now. Try again.");
  }
}

// Locks the saved draft as the next version: exactly what the user saw (the
// same updated_at), recalculated here, every origin complete. The row is
// built on the server and stored through the one service-role module, with
// the signed-in user's id; nothing but the two ids is read from the browser.
export async function lockWorkspaceAction(input: unknown): Promise<LockWorkspaceState> {
  const role = await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);

  const request = lockInputSchema.safeParse(input);
  if (!request.success) return fail("not_found", NOT_FOUND);
  const { workspaceId, expectedUpdatedAt } = request.data;
  const denied = await checkCanEdit(supabase, workspaceId, userId, role);
  if (denied) return denied;

  const loaded = await loadWorkspace(supabase, workspaceId);
  if (!loaded.ok) return fail(loaded.code === "not_found" ? "not_found" : "failed", loaded.message);
  const workspace = loaded.workspace;
  if (workspace.updatedAt !== expectedUpdatedAt) return fail("stale", LOCK_STALE);
  if (workspace.scenarios.length === 0) return fail("invalid", "This workspace has no origin to lock.");

  let result: WorkspaceResult;
  try {
    result = await computeWorkspaceResult(supabase, workspace, todayUtc());
  } catch (error) {
    console.error("lockWorkspaceAction compute error:", error);
    return fail("failed", LOCK_FAILED);
  }
  const blocked = lockBlocker(workspace, result);
  if (blocked) return fail("invalid", blocked);

  const built = buildSnapshotRow(workspace, result);
  if (!built.ok) return fail("invalid", built.error);
  const saved = await saveLandedCostSnapshot(userId, built.row);
  if (!saved.ok) {
    switch (saved.code) {
      case "LC409":
        return fail("stale", LOCK_STALE);
      case "42501":
        return fail("forbidden", OWNER_ONLY);
      case "P0002":
        return fail("not_found", NOT_FOUND);
      case "23514":
      case "LC422":
        return fail("invalid", LOCK_MISMATCH);
      default:
        return fail("failed", LOCK_FAILED);
    }
  }
  revalidatePath(`/landed-cost/${workspaceId}`);
  return { ok: true, versionId: saved.id, versionNo: saved.versionNo };
}

// Deletes one locked version: its creator, the workspace's owner or an admin
// (RLS enforces the same; checked here to say so plainly).
export async function deleteSnapshotAction(input: unknown): Promise<DeleteSnapshotState> {
  const role = await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return fail("forbidden", SIGN_IN);

  const request = deleteSnapshotInputSchema.safeParse(input);
  if (!request.success) return fail("not_found", SNAPSHOT_NOT_FOUND);
  const { snapshotId } = request.data;
  const { data, error: readError } = await supabase
    .from("landed_cost_snapshots")
    .select("workspace_id, created_by, landed_cost_workspaces(owner_id)")
    .eq("id", snapshotId)
    .maybeSingle();
  if (readError) {
    console.error("deleteSnapshotAction read error:", readError);
    return fail("failed", UNEXPECTED);
  }
  if (!data) return fail("not_found", SNAPSHOT_NOT_FOUND);
  const owner = (data.landed_cost_workspaces as { owner_id?: string } | null)?.owner_id;
  if (data.created_by !== userId && owner !== userId && role !== "admin") return fail("forbidden", SNAPSHOT_OWNER_ONLY);

  const { error, count } = await supabase.from("landed_cost_snapshots").delete({ count: "exact" }).eq("id", snapshotId);
  if (error) {
    console.error("deleteSnapshotAction error:", error);
    return fail("failed", "The version couldn't be deleted right now. Try again.");
  }
  if (count === 0) return fail("forbidden", SNAPSHOT_OWNER_ONLY);
  revalidatePath(`/landed-cost/${data.workspace_id}`);
  return { ok: true };
}

// A locked version, for its exports: read through RLS (any staff member),
// parsed with Zod and restored. Never recalculated.
async function lockedForExport(input: unknown) {
  const request = exportVersionInputSchema.safeParse(input);
  if (!request.success) return { ok: false as const, error: fail("not_found", VERSION_NOT_FOUND) };
  const supabase = await createClient();
  const loaded = await loadLockedVersion(supabase, null, request.data.snapshotId);
  if (!loaded.ok) {
    return { ok: false as const, error: loaded.code === "not_found" ? fail("not_found", VERSION_NOT_FOUND) : fail("failed", EXPORT_FAILED) };
  }
  const version = loaded.version;
  if (!version.snapshot) return { ok: false as const, error: fail("invalid", VERSION_UNREADABLE) };
  const names = await loadFirstNames(supabase, [version.created_by]).catch((error) => {
    console.error("version export names error:", error);
    return new Map<string, string | null>();
  });
  return { ok: true as const, meta: describeVersion(version, personName(version.created_by, names)), restored: restoreSnapshot(version.snapshot) };
}

// The locked version as a PDF, from its stored snapshot only.
export async function exportVersionPdfAction(input: unknown): Promise<ExportVersionPdfState> {
  await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const locked = await lockedForExport(input);
  if (!locked.ok) return locked.error;
  try {
    const buffer = await renderVersionPdf(buildVersionReport(locked.meta, locked.restored));
    return {
      ok: true,
      base64: buffer.toString("base64"),
      filename: versionFilename(locked.meta.workspaceName, locked.meta.versionNo, locked.meta.lockedDate, "pdf"),
    };
  } catch (error) {
    console.error("exportVersionPdfAction error:", error);
    return fail("failed", EXPORT_FAILED);
  }
}

// The locked version as CSV, from its stored snapshot only: the 5a builder
// with the LOCKED line in place of DRAFT.
export async function exportVersionCsvAction(input: unknown): Promise<ExportVersionCsvState> {
  await requireStaff();
  if (!isLandedCostEnabled()) return unavailable();
  const locked = await lockedForExport(input);
  if (!locked.ok) return locked.error;
  const { meta, restored } = locked;
  try {
    return {
      ok: true,
      csv: buildWorkspaceCsv(restored.workspace, restored.result, {
        versionNo: meta.versionNo,
        lockedOn: meta.lockedOn,
        byName: meta.byName,
        release: meta.release,
        asOf: meta.asOf,
      }),
      filename: versionFilename(meta.workspaceName, meta.versionNo, meta.lockedDate, "csv"),
    };
  } catch (error) {
    console.error("exportVersionCsvAction error:", error);
    return fail("failed", EXPORT_FAILED);
  }
}
