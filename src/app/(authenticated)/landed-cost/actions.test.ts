import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The Landed Cost actions: the draft is checked before anything is sent, only
// the owner or an admin gets as far as the database (RLS refuses the rest as
// well, see pgTAP 38), updated_at goes back exactly as it was read, and a
// database error is reported in our own words. The database is stubbed.

const WORKSPACE = "00000000-0000-4000-8000-000000000301";
const SCENARIO = "00000000-0000-4000-8000-000000000302";
const LINE = "00000000-0000-4000-8000-000000000303";
// As PostgREST returns timestamptz: microseconds and an offset.
const UPDATED_AT = "2026-10-21T02:02:38.123456+00:00";

let ownerId = "u1";
let role = "logistics_expert";
let rpcResult: { data: unknown; error: { code: string; message: string } | null } = { data: null, error: null };
let deleteCount = 1;
let enabled = true;
let snapshotCount = 0;
let snapshotRow: unknown = null;
const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  void name;
  void args;
  return rpcResult;
});
const deletes: string[] = [];

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc,
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          table === "landed_cost_snapshots"
            ? { data: snapshotRow, error: null }
            : { data: ownerId ? { owner_id: ownerId } : null, error: null },
        // A count query (head: true) awaited directly.
        then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null, count: table === "landed_cost_snapshots" ? snapshotCount : null }),
        delete: () => {
          deletes.push(table);
          return { eq: async () => ({ error: null, count: deleteCount }) };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
// The staff guard is tested in require-staff.test.ts; here the caller is staff.
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff: vi.fn(async () => role) }));
vi.mock("@/lib/fx/server-rates", () => ({ todayUtc: () => "2026-10-21" }));
vi.mock("@/lib/landed-cost/feature-flag", () => ({ isLandedCostEnabled: () => enabled }));
const createClient = vi.fn(async () => stubClient());
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

// The export's load and calculation are tested in their own files; here they're stubbed.
let loadResult: unknown = null;
const loadWorkspace = vi.fn(async () => loadResult);
const computeWorkspaceResult = vi.fn(async () => ({ state: "no_sku_lines", calculatedOn: "2026-10-21", entryDate: "2026-11-01" }));
vi.mock("@/lib/landed-cost/server-workspace", () => ({ loadWorkspace }));
vi.mock("@/lib/landed-cost/server-compute", () => ({ computeWorkspaceResult }));
// The one service-role module: what it's called with is the point here.
const saveLandedCostSnapshot = vi.fn(async (userId: string, row: unknown) => {
  void userId;
  void row;
  return { ok: true, id: "00000000-0000-4000-8000-000000000399", versionNo: 3 } as
    | { ok: true; id: string; versionNo: number }
    | { ok: false; code: string | null; message: string | null };
});
vi.mock("@/lib/landed-cost/snapshot-store", () => ({ saveLandedCostSnapshot }));

const { createWorkspaceAction, deleteSnapshotAction, deleteWorkspaceAction, exportWorkspaceCsvAction, lockWorkspaceAction, saveDraftAction } =
  await import("./actions");

const scenario = {
  label: "China", originCountry: "cn", supplierName: "", incoterm: "FOB", shipmentMode: "Sea", entryType: "formal",
  freightTotalUsd: "854.00", freightBasis: "value", volumetricDivisor: "",
};
const draft = (fob = "6.00") => ({
  name: "Q4", entryDate: "2026-11-01", baselineRef: SCENARIO,
  skuLines: [{ ref: LINE, id: LINE, skuCode: "SKU-001", htsCode: "6402.99.31.10", quantity: "100" }],
  scenarios: [{ ref: SCENARIO, id: SCENARIO, ...scenario, items: [{ skuRef: LINE, fobUnitPriceUsd: fob }], otherCosts: [] }],
});
const saveInput = (over: Record<string, unknown> = {}) => ({ workspaceId: WORKSPACE, expectedUpdatedAt: UPDATED_AT, draft: draft(), ...over });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  ownerId = "u1";
  role = "logistics_expert";
  rpcResult = { data: { updated_at: "2026-10-21T02:05:00.000001+00:00", sku_lines: { [LINE]: LINE }, scenarios: { [SCENARIO]: SCENARIO } }, error: null };
  deleteCount = 1;
  enabled = true;
  rpc.mockClear();
  createClient.mockClear();
  deletes.length = 0;
  loadWorkspace.mockClear();
  computeWorkspaceResult.mockReset();
  computeWorkspaceResult.mockImplementation(async () => ({ state: "no_sku_lines", calculatedOn: "2026-10-21", entryDate: "2026-11-01" }));
  saveLandedCostSnapshot.mockClear();
  snapshotCount = 0;
  snapshotRow = null;
});
afterEach(() => vi.restoreAllMocks());

describe("saveDraftAction", () => {
  test("sends the normalised draft and updated_at exactly as read (microseconds, no Date)", async () => {
    const result = await saveDraftAction(saveInput());
    expect(result).toEqual({
      ok: true,
      updatedAt: "2026-10-21T02:05:00.000001+00:00",
      ids: { skuLines: { [LINE]: LINE }, scenarios: { [SCENARIO]: SCENARIO } },
    });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("save_landed_cost_draft");
    expect(args.p_expected_updated_at).toBe(UPDATED_AT);
    expect(args.p_workspace_id).toBe(WORKSPACE);
    const payload = args.p_payload as { sku_lines: { hts_code: string }[]; scenarios: { origin_country: string }[] };
    expect(payload.sku_lines[0].hts_code).toBe("6402993110");
    expect(payload.scenarios[0].origin_country).toBe("CN");
  });

  test("an updated_at that isn't the database's text is refused before anything is sent", async () => {
    for (const bad of ["Wed Oct 21 2026 02:02:38 GMT+0000", "2026-10-21T02:02:38.1234567+00:00", "1792548158123"]) {
      expect(await saveDraftAction(saveInput({ expectedUpdatedAt: bad }))).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a FOB price of 0 is refused with its own message, before the database", async () => {
    expect(await saveDraftAction(saveInput({ draft: draft("0") }))).toMatchObject({ ok: false, code: "invalid", error: "Enter a FOB price above $0.00." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("another expert is told only the owner or an admin can edit; nothing is sent", async () => {
    ownerId = "u2";
    expect(await saveDraftAction(saveInput())).toEqual({
      ok: false, code: "forbidden", error: "Only the workspace's owner or an admin can edit it.", issues: undefined,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("an admin can save someone else's workspace", async () => {
    ownerId = "u2";
    role = "admin";
    expect((await saveDraftAction(saveInput())).ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("a workspace changed since it was read: the stale message", async () => {
    rpcResult = { data: null, error: { code: "LC409", message: "This workspace was changed since you opened it." } };
    expect(await saveDraftAction(saveInput())).toMatchObject({ ok: false, code: "stale", error: expect.stringMatching(/changed by someone else/) });
  });

  test("a database error never reaches the user as SQL", async () => {
    rpcResult = { data: null, error: { code: "23514", message: 'new row for relation "landed_cost_scenarios" violates check constraint "x"' } };
    const result = await saveDraftAction(saveInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toMatch(/relation|constraint/);
  });

  test("a workspace that isn't there", async () => {
    ownerId = "";
    expect(await saveDraftAction(saveInput())).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("createWorkspaceAction", () => {
  test("creates with the normalised first scenario", async () => {
    rpcResult = { data: WORKSPACE, error: null };
    expect(await createWorkspaceAction({ name: " Q4 ", entryDate: "2026-11-01", scenario })).toEqual({ ok: true, workspaceId: WORKSPACE });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_landed_cost_workspace");
    expect(args.p_payload).toMatchObject({ name: "Q4", scenario: { origin_country: "CN", supplier_name: null } });
  });

  test("an entry date out of range is refused before the database", async () => {
    expect(await createWorkspaceAction({ name: "Q4", entryDate: "2026-01-01", scenario })).toMatchObject({ ok: false, code: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("deleteWorkspaceAction", () => {
  test("the owner deletes it", async () => {
    expect(await deleteWorkspaceAction({ workspaceId: WORKSPACE })).toEqual({ ok: true });
    expect(deletes).toEqual(["landed_cost_workspaces"]);
  });

  test("another expert can't; a delete RLS hides is reported, not silent", async () => {
    ownerId = "u2";
    expect(await deleteWorkspaceAction({ workspaceId: WORKSPACE })).toMatchObject({ ok: false, code: "forbidden" });
    expect(deletes).toEqual([]);
    ownerId = "u1";
    deleteCount = 0;
    expect(await deleteWorkspaceAction({ workspaceId: WORKSPACE })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("exportWorkspaceCsvAction", () => {
  const loaded = (over: Record<string, unknown> = {}) => ({
    ok: true,
    workspace: {
      id: WORKSPACE, ownerId: "someone-else", name: "Q4 mugs", entryDate: "2026-11-01", currency: "USD", baselineScenarioId: SCENARIO,
      createdAt: UPDATED_AT, updatedAt: UPDATED_AT, skuLines: [],
      scenarios: [{ id: SCENARIO, ...scenario, originCountry: "CN", supplierName: null, volumetricDivisor: null, isBaseline: true, items: [], otherCosts: [] }],
      ...over,
    },
  });

  test("any staff member, not only the owner: calculated on the server, with the draft filename", async () => {
    loadResult = loaded();
    const result = await exportWorkspaceCsvAction({ workspaceId: WORKSPACE });
    if (!result.ok) throw new Error(result.error);
    expect(result.filename).toBe("landed-cost-Q4-mugs-2026-10-21-draft.csv");
    expect(result.csv).toMatch(/^Landed Cost workspace\r\nField,Value\r\nWorkspace,Q4 mugs\r\n/);
    expect(computeWorkspaceResult).toHaveBeenCalledWith(expect.anything(), (loadResult as { workspace: unknown }).workspace, "2026-10-21");
  });

  test("only the workspace id is read from the browser; numbers sent along are ignored", async () => {
    loadResult = loaded();
    await exportWorkspaceCsvAction({ workspaceId: WORKSPACE, csv: "=1+1", totals: { totalCents: 1 } });
    expect(loadWorkspace).toHaveBeenLastCalledWith(expect.anything(), WORKSPACE);
  });

  test("a bad id, a missing workspace, or one with no scenario", async () => {
    expect(await exportWorkspaceCsvAction({ workspaceId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
    loadResult = { ok: false, code: "not_found", message: "This workspace doesn't exist, or you can't open it." };
    expect(await exportWorkspaceCsvAction({ workspaceId: WORKSPACE })).toMatchObject({ ok: false, code: "not_found" });
    loadResult = loaded({ scenarios: [] });
    expect(await exportWorkspaceCsvAction({ workspaceId: WORKSPACE })).toMatchObject({ ok: false, code: "failed" });
  });
});

describe("deleteWorkspaceAction with locked versions", () => {
  test("refused with the number of versions, before any delete", async () => {
    snapshotCount = 2;
    expect(await deleteWorkspaceAction({ workspaceId: WORKSPACE })).toEqual({
      ok: false, code: "invalid", error: "This workspace has 2 locked versions. Delete them first.", issues: undefined,
    });
    snapshotCount = 1;
    expect(await deleteWorkspaceAction({ workspaceId: WORKSPACE })).toMatchObject({ error: "This workspace has 1 locked version. Delete it first." });
    expect(deletes).toEqual([]);
  });
});

describe("lockWorkspaceAction", () => {
  // The golden China vs Vietnam workspace, calculated by the real pipeline on the stub tables.
  const golden = async () => {
    const { scenario: china, vietnamScenario, workspace } = await import("@/lib/landed-cost/__fixtures__/workspace-builders");
    return workspace({ id: WORKSPACE, ownerId: "00000000-0000-4000-8000-0000000000a1", updatedAt: UPDATED_AT, scenarios: [china(), vietnamScenario()] });
  };
  async function realCompute() {
    const actual = await vi.importActual<typeof import("@/lib/landed-cost/server-compute")>("@/lib/landed-cost/server-compute");
    const { stubSupabase } = await import("@/lib/tariff/__fixtures__/supabase-stub");
    const { CALCULATED_ON } = await import("@/lib/landed-cost/__fixtures__/duty-tables");
    const { tables } = await import("@/lib/landed-cost/__fixtures__/workspace-builders");
    computeWorkspaceResult.mockImplementation((async (_client: unknown, w: never) =>
      actual.computeWorkspaceResult(stubSupabase(tables()) as never, w, CALCULATED_ON)) as never);
  }
  const lockInput = (over: Record<string, unknown> = {}) => ({ workspaceId: WORKSPACE, expectedUpdatedAt: UPDATED_AT, ...over });

  test("locks the saved draft: the row built on the server, the user id from the session only", async () => {
    loadResult = { ok: true, workspace: await golden() };
    await realCompute();
    const result = await lockWorkspaceAction(
      lockInput({ userId: "00000000-0000-4000-8000-0000000000ff", p_user_id: "evil", baseline_per_unit_usd: "0.01", row: { incomplete: false }, result: {} }),
    );
    expect(result).toEqual({ ok: true, versionId: "00000000-0000-4000-8000-000000000399", versionNo: 3 });
    expect(saveLandedCostSnapshot).toHaveBeenCalledTimes(1);
    const [userId, row] = saveLandedCostSnapshot.mock.calls[0] as [string, Record<string, unknown>];
    expect(userId).toBe("u1");
    expect(row).toMatchObject({ workspace_id: WORKSPACE, workspace_updated_at: UPDATED_AT, baseline_label: "China", baseline_per_unit_usd: "17.35", origin_count: 2 });
    expect(Object.keys(row)).not.toContain("created_by");
    expect(revalidatePath).toHaveBeenCalledWith(`/landed-cost/${WORKSPACE}`);
  });

  test("an admin can lock someone else's workspace; another expert is told it's the owner's", async () => {
    loadResult = { ok: true, workspace: await golden() };
    await realCompute();
    ownerId = "u2";
    expect(await lockWorkspaceAction(lockInput())).toMatchObject({ ok: false, code: "forbidden", error: "Only the workspace's owner or an admin can edit it." });
    expect(saveLandedCostSnapshot).not.toHaveBeenCalled();
    role = "admin";
    expect(await lockWorkspaceAction(lockInput())).toMatchObject({ ok: true });
  });

  test("stale: a workspace saved since it was opened is refused, exact string, before calculating", async () => {
    loadResult = { ok: true, workspace: await golden() };
    expect(await lockWorkspaceAction(lockInput({ expectedUpdatedAt: "2026-10-21T02:02:38.123457+00:00" }))).toMatchObject({ ok: false, code: "stale" });
    expect(computeWorkspaceResult).not.toHaveBeenCalled();
    expect(saveLandedCostSnapshot).not.toHaveBeenCalled();
  });

  test("an incomplete origin: refused with what's missing; pending programs alone don't block", async () => {
    const w = await golden();
    loadResult = { ok: true, workspace: { ...w, scenarios: [w.scenarios[0], { ...w.scenarios[1], freightTotalUsd: null }] } };
    await realCompute();
    expect(await lockWorkspaceAction(lockInput())).toMatchObject({
      ok: false, code: "invalid", error: "Complete every origin before locking: Vietnam: Freight total (USD).",
    });
    expect(saveLandedCostSnapshot).not.toHaveBeenCalled();
  });

  test("the database's refusals in our words", async () => {
    loadResult = { ok: true, workspace: await golden() };
    await realCompute();
    for (const [code, expected] of [["LC409", "stale"], ["23514", "invalid"], ["42501", "forbidden"], ["XX000", "failed"]] as const) {
      saveLandedCostSnapshot.mockResolvedValueOnce({ ok: false, code, message: "SQL detail" });
      const result = await lockWorkspaceAction(lockInput());
      expect(result).toMatchObject({ ok: false, code: expected });
      expect(JSON.stringify(result)).not.toContain("SQL detail");
    }
  });

  test("a bad id or timestamp is refused before anything is read", async () => {
    expect(await lockWorkspaceAction({ workspaceId: "nope", expectedUpdatedAt: UPDATED_AT })).toMatchObject({ ok: false, code: "not_found" });
    expect(await lockWorkspaceAction({ workspaceId: WORKSPACE, expectedUpdatedAt: "yesterday" })).toMatchObject({ ok: false, code: "not_found" });
    expect(loadWorkspace).not.toHaveBeenCalled();
  });
});

describe("deleteSnapshotAction", () => {
  const SNAPSHOT = "00000000-0000-4000-8000-000000000398";
  test("the creator, the workspace owner or an admin; anyone else is told who can", async () => {
    snapshotRow = { workspace_id: WORKSPACE, created_by: "u1", landed_cost_workspaces: { owner_id: "u2" } };
    expect(await deleteSnapshotAction({ snapshotId: SNAPSHOT })).toEqual({ ok: true });
    snapshotRow = { workspace_id: WORKSPACE, created_by: "u3", landed_cost_workspaces: { owner_id: "u1" } };
    expect(await deleteSnapshotAction({ snapshotId: SNAPSHOT })).toEqual({ ok: true });
    snapshotRow = { workspace_id: WORKSPACE, created_by: "u3", landed_cost_workspaces: { owner_id: "u2" } };
    expect(await deleteSnapshotAction({ snapshotId: SNAPSHOT })).toMatchObject({ ok: false, code: "forbidden" });
    role = "admin";
    expect(await deleteSnapshotAction({ snapshotId: SNAPSHOT })).toEqual({ ok: true });
    expect(deletes).toEqual(["landed_cost_snapshots", "landed_cost_snapshots", "landed_cost_snapshots"]);
  });

  test("a version that isn't there", async () => {
    expect(await deleteSnapshotAction({ snapshotId: SNAPSHOT })).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteSnapshotAction({ snapshotId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("behind the feature flag", () => {
  test("off: every action refuses with a generic message, before any database call", async () => {
    enabled = false;
    const results = [
      await createWorkspaceAction({ name: "Q4", entryDate: "2026-11-01", scenario }),
      await saveDraftAction(saveInput()),
      await deleteWorkspaceAction({ workspaceId: WORKSPACE }),
      await exportWorkspaceCsvAction({ workspaceId: WORKSPACE }),
      await lockWorkspaceAction({ workspaceId: WORKSPACE, expectedUpdatedAt: UPDATED_AT }),
      await deleteSnapshotAction({ snapshotId: WORKSPACE }),
    ];
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "unavailable", error: "Landed Cost isn't available yet.", issues: undefined });
    }
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
    expect(loadWorkspace).not.toHaveBeenCalled();
    expect(computeWorkspaceResult).not.toHaveBeenCalled();
    expect(saveLandedCostSnapshot).not.toHaveBeenCalled();
  });

  test("every action checks the flag right after requireStaff()", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    const actions = [...source.matchAll(/export async function (\w+)[^{]*\{\n(.*)\n(.*)\n/g)];
    expect(actions.map((a) => a[1])).toEqual([
      "createWorkspaceAction",
      "saveDraftAction",
      "deleteWorkspaceAction",
      "exportWorkspaceCsvAction",
      "lockWorkspaceAction",
      "deleteSnapshotAction",
    ]);
    for (const [, , first, second] of actions) {
      expect(first.trim()).toMatch(/^(const role = )?await requireStaff\(\);$/);
      expect(second.trim()).toBe("if (!isLandedCostEnabled()) return unavailable();");
    }
  });
});
