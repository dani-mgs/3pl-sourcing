import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { parseSnapshot, type ParsedSnapshot } from "./snapshot-schema";

// SERVER-ONLY. Reads locked versions with the caller's client (RLS: any staff
// member reads). Nothing is recalculated: a version is shown from what was
// stored when it was locked.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const LIST_COLUMNS = "id, version_no, created_at, created_by, as_of_date, baseline_label, baseline_per_unit_usd::text, incomplete, origin_count";
const VERSION_COLUMNS =
  "id, workspace_id, version_no, created_at, created_by, as_of_date, workspace_name, entry_date, hts_release_name, hts_release_title, " +
  "hts_release_start_date, schema_version, inputs, result, incomplete";

const listRowSchema = z.object({
  id: z.uuid(),
  version_no: z.number().int(),
  created_at: z.string(),
  created_by: z.uuid(),
  as_of_date: z.string(),
  baseline_label: z.string(),
  baseline_per_unit_usd: z.string(),
  incomplete: z.boolean(),
  origin_count: z.number().int(),
});
export type SnapshotListRow = z.output<typeof listRowSchema>;

const versionRowSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  version_no: z.number().int(),
  created_at: z.string(),
  created_by: z.uuid(),
  as_of_date: z.string(),
  workspace_name: z.string(),
  entry_date: z.string(),
  hts_release_name: z.string(),
  hts_release_title: z.string().nullable(),
  hts_release_start_date: z.string().nullable(),
  schema_version: z.unknown(),
  inputs: z.unknown(),
  result: z.unknown(),
  incomplete: z.boolean(),
});

export type LockedVersion = Omit<z.output<typeof versionRowSchema>, "schema_version" | "inputs" | "result"> & {
  // Null when the stored data doesn't match the schema: "can't be displayed".
  snapshot: ParsedSnapshot | null;
};

export type SnapshotListResult = { ok: true; versions: SnapshotListRow[] } | { ok: false };
export type LockedVersionResult = { ok: true; version: LockedVersion } | { ok: false; code: "not_found" | "load_failed" };

// Newest first.
export async function loadSnapshotList(supabase: Supabase, workspaceId: string): Promise<SnapshotListResult> {
  const { data, error } = await supabase
    .from("landed_cost_snapshots")
    .select(LIST_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("version_no", { ascending: false });
  if (error) {
    console.error("loadSnapshotList error:", error);
    return { ok: false };
  }
  const rows = z.array(listRowSchema).safeParse(data);
  if (!rows.success) {
    console.error("loadSnapshotList: unexpected rows", rows.error.issues.slice(0, 3));
    return { ok: false };
  }
  return { ok: true, versions: rows.data };
}

// One version of one workspace (the version page), or, with workspaceId
// null, one version by its id alone (the exports).
export async function loadLockedVersion(supabase: Supabase, workspaceId: string | null, versionId: string): Promise<LockedVersionResult> {
  if ((workspaceId !== null && !z.uuid().safeParse(workspaceId).success) || !z.uuid().safeParse(versionId).success) {
    return { ok: false, code: "not_found" };
  }
  let query = supabase.from("landed_cost_snapshots").select(VERSION_COLUMNS).eq("id", versionId);
  if (workspaceId !== null) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("loadLockedVersion error:", error);
    return { ok: false, code: "load_failed" };
  }
  if (!data) return { ok: false, code: "not_found" };
  const row = versionRowSchema.safeParse(data);
  if (!row.success) {
    console.error("loadLockedVersion: unexpected row", row.error.issues.slice(0, 3));
    return { ok: false, code: "load_failed" };
  }
  const { schema_version, inputs, result, ...rest } = row.data;
  const parsed = parseSnapshot({ schema_version, inputs, result });
  if (!parsed.ok) console.error("loadLockedVersion: stored version doesn't match the schema", versionId);
  return { ok: true, version: { ...rest, snapshot: parsed.ok ? parsed.snapshot : null } };
}
