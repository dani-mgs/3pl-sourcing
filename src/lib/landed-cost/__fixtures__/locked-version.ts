import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { computeWorkspaceResult } from "../server-compute";
import { buildSnapshotRow, parseSnapshot, restoreSnapshot, type ParsedSnapshot } from "../snapshot-schema";
import type { VersionMeta } from "../version-report";
import type { Workspace } from "../workspace-schema";
import { CALCULATED_ON } from "./duty-tables";
import { tables, workspace } from "./workspace-builders";

// A workspace locked as the app locks it (the real pipeline on the stub
// tables), stored as JSON and read back through the schema: what the version
// page and the exports start from.

export const LOCKED_IDS = { id: "00000000-0000-4000-8000-000000000001", ownerId: "00000000-0000-4000-8000-0000000000a1" };

export async function lockedSnapshot(over: Partial<Workspace>, t = tables()): Promise<ParsedSnapshot> {
  const w = workspace({ ...LOCKED_IDS, ...over });
  const built = buildSnapshotRow(w, await computeWorkspaceResult(stubSupabase(t), w, CALCULATED_ON));
  if (!built.ok) throw new Error(built.error);
  const parsed = parseSnapshot(JSON.parse(JSON.stringify(built.row)));
  if (!parsed.ok) throw new Error("the stored version doesn't parse");
  return parsed.snapshot;
}

export async function lockedVersion(over: Partial<Workspace>, t = tables()) {
  const snapshot = await lockedSnapshot(over, t);
  return { snapshot, restored: restoreSnapshot(snapshot) };
}

export const versionMeta = (over: Partial<VersionMeta> = {}): VersionMeta => ({
  versionNo: 3,
  lockedAt: "2026-10-02T09:30:00.123456+00:00",
  lockedOn: "2 Oct 2026",
  byName: "Dani",
  workspaceName: "Golden",
  entryDate: "5 Nov 2026",
  release: "Revision 20 (2026HTSRev20)",
  asOf: "2 Oct 2026",
  incomplete: false,
  ...over,
});
