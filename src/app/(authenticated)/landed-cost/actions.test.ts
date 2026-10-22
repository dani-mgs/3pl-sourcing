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
// The app's own rate for a replaced layer (tested in server-override-engine.test.ts).
type EngineResult = { ok: true; rates: () => { rateText: string; amountUsd: string } | null } | { ok: false; error: string; issues: { path: string; message: string }[] };
let engineResult: EngineResult = { ok: true, rates: () => ({ rateText: "+25%", amountUsd: "150.00" }) };
const engineRatesFor = vi.fn(async (...args: unknown[]) => {
  void args;
  return engineResult;
});
vi.mock("@/lib/landed-cost/server-override-engine", () => ({ engineRatesFor }));
vi.mock("@/lib/landed-cost/server-workspace-list", () => ({ loadFirstNames: async () => new Map([["00000000-0000-4000-8000-0000000000a1", "Dani"]]) }));

const {
  createWorkspaceAction,
  deleteSnapshotAction,
  deleteWorkspaceAction,
  exportVersionCsvAction,
  exportVersionPdfAction,
  exportWorkspaceCsvAction,
  lockWorkspaceAction,
  saveDraftAction,
} = await import("./actions");

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
  engineRatesFor.mockClear();
  engineResult = { ok: true, rates: () => ({ rateText: "+25%", amountUsd: "150.00" }) };
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
      ids: { skuLines: { [LINE]: LINE }, scenarios: { [SCENARIO]: SCENARIO }, overrides: {} },
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

  test("manual rates: the app's rate for a replaced layer comes from the server; who, when and the browser's rates are dropped", async () => {
    loadResult = { ok: true, workspace: { id: WORKSPACE, scenarios: [] } };
    const withOverride = draft();
    (withOverride.scenarios[0].items[0] as Record<string, unknown>).overrides = [{
      ref: "o1", id: null, kind: "replace", layerKey: "section_301_china", ratePercent: "0", reason: "Exclusion",
      engineRateText: "+99%", engineAmountUsd: "1.00", setBy: "u2", setAt: "2020-01-01T00:00:00Z", changedBy: "u2",
    }];
    rpcResult = { data: { updated_at: "2026-10-21T02:05:00.000001+00:00", sku_lines: {}, scenarios: {}, overrides: { o1: "00000000-0000-4000-8000-000000000310" } }, error: null };
    const result = await saveDraftAction(saveInput({ draft: withOverride }));
    expect(result).toMatchObject({ ok: true, ids: { overrides: { o1: "00000000-0000-4000-8000-000000000310" } } });
    expect(loadWorkspace).toHaveBeenCalledWith(expect.anything(), WORKSPACE);
    expect(engineRatesFor.mock.calls[0][2]).toEqual({ id: WORKSPACE, scenarios: [] });
    const payload = rpc.mock.calls[0][1].p_payload as { scenarios: { items: { overrides: Record<string, unknown>[] }[] }[] };
    expect(payload.scenarios[0].items[0].overrides).toEqual([{
      ref: "o1", kind: "replace", layer_key: "section_301_china", label: null, rate_percent: "0", amount_usd: null, reason: "Exclusion",
      engine_rate_text: "+25%", engine_amount_usd: "150.00", sort_order: 0,
    }]);
  });

  test("manual rates: a replace the app can't work out is refused before the database", async () => {
    loadResult = { ok: true, workspace: { id: WORKSPACE, scenarios: [] } };
    engineResult = { ok: false, error: "SKU-001 in China: the app doesn't apply x.", issues: [{ path: "scenarios.0.items.0.overrides.0.layerKey", message: "SKU-001 in China: the app doesn't apply x." }] };
    const withOverride = draft();
    (withOverride.scenarios[0].items[0] as Record<string, unknown>).overrides = [{ ref: "o1", kind: "replace", layerKey: "x", ratePercent: "0", reason: "r" }];
    expect(await saveDraftAction(saveInput({ draft: withOverride }))).toMatchObject({ ok: false, code: "invalid", issues: [{ path: "scenarios.0.items.0.overrides.0.layerKey" }] });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("without a replace, nothing extra is loaded", async () => {
    expect((await saveDraftAction(saveInput())).ok).toBe(true);
    expect(loadWorkspace).not.toHaveBeenCalled();
    expect(engineRatesFor).not.toHaveBeenCalled();
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

describe("exportVersionPdfAction / exportVersionCsvAction", () => {
  const SNAPSHOT = "00000000-0000-4000-8000-000000000397";
  // A version as stored: built by the real pipeline, through JSON, as the database returns the row.
  async function storedRow(): Promise<Record<string, unknown>> {
    const actual = await vi.importActual<typeof import("@/lib/landed-cost/server-compute")>("@/lib/landed-cost/server-compute");
    const { stubSupabase } = await import("@/lib/tariff/__fixtures__/supabase-stub");
    const { CALCULATED_ON } = await import("@/lib/landed-cost/__fixtures__/duty-tables");
    const { scenario: china, tables, vietnamScenario, workspace } = await import("@/lib/landed-cost/__fixtures__/workspace-builders");
    const { buildSnapshotRow } = await import("@/lib/landed-cost/snapshot-schema");
    const w = workspace({ id: WORKSPACE, ownerId: "00000000-0000-4000-8000-0000000000a1", name: "Q4 mugs", scenarios: [china(), vietnamScenario()] });
    const built = buildSnapshotRow(w, await actual.computeWorkspaceResult(stubSupabase(tables()) as never, w, CALCULATED_ON));
    if (!built.ok) throw new Error(built.error);
    const r = built.row;
    return JSON.parse(JSON.stringify({
      id: SNAPSHOT, workspace_id: WORKSPACE, version_no: 3, created_at: "2026-10-02T09:30:00.123456+00:00",
      created_by: "00000000-0000-4000-8000-0000000000a1", as_of_date: r.as_of_date, workspace_name: r.workspace_name,
      entry_date: r.entry_date, hts_release_name: r.hts_release_name, hts_release_title: r.hts_release_title,
      hts_release_start_date: r.hts_release_start_date, schema_version: r.schema_version, inputs: r.inputs, result: r.result,
      incomplete: r.incomplete,
    }));
  }
  const never = () => {
    throw new Error("a locked version must not be recalculated");
  };

  test("any staff member, from the stored version only: the PDF and the CSV with their filenames", async () => {
    snapshotRow = await storedRow();
    computeWorkspaceResult.mockImplementation(never as never);
    ownerId = "someone-else";
    const pdf = await exportVersionPdfAction({ snapshotId: SNAPSHOT });
    if (!pdf.ok) throw new Error(pdf.error);
    expect(pdf.filename).toBe("landed-cost-Q4-mugs-v3-2026-10-02.pdf");
    expect(Buffer.from(pdf.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    const csv = await exportVersionCsvAction({ snapshotId: SNAPSHOT });
    if (!csv.ok) throw new Error(csv.error);
    expect(csv.filename).toBe("landed-cost-Q4-mugs-v3-2026-10-02.csv");
    expect(csv.csv).toContain("LOCKED VERSION v3, locked on Oct 2, 2026 by Dani. These figures are fixed.");
    expect(csv.csv).toContain("1,China,Yes,Lowest landed cost,17.35,1734.73,Baseline");
    expect(computeWorkspaceResult).not.toHaveBeenCalled();
    expect(loadWorkspace).not.toHaveBeenCalled();
  });

  test("only the id is read from the browser", async () => {
    snapshotRow = await storedRow();
    const csv = await exportVersionCsvAction({ snapshotId: SNAPSHOT, csv: "=1+1", versionNo: 99, byName: "Mallory", result: {} });
    if (!csv.ok) throw new Error(csv.error);
    expect(csv.csv).not.toMatch(/Mallory|v99|=1\+1/);
  });

  test("stored data that fails the schema: refused in words", async () => {
    const row = await storedRow();
    (row.result as { origins: { totalUsd: unknown }[] }).origins[0].totalUsd = 1734.73;
    snapshotRow = row;
    for (const result of [await exportVersionPdfAction({ snapshotId: SNAPSHOT }), await exportVersionCsvAction({ snapshotId: SNAPSHOT })]) {
      expect(result).toEqual({
        ok: false, code: "invalid", error: "This version can't be exported: its stored data isn't in a form this export can read.", issues: undefined,
      });
    }
  });

  test("a bad id, or a version that isn't there (or RLS hides)", async () => {
    expect(await exportVersionPdfAction({ snapshotId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
    snapshotRow = null;
    expect(await exportVersionCsvAction({ snapshotId: SNAPSHOT })).toMatchObject({
      ok: false, code: "not_found", error: "This version doesn't exist, or you can't open it.",
    });
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
      await exportVersionPdfAction({ snapshotId: WORKSPACE }),
      await exportVersionCsvAction({ snapshotId: WORKSPACE }),
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
      "exportVersionPdfAction",
      "exportVersionCsvAction",
    ]);
    for (const [, , first, second] of actions) {
      expect(first.trim()).toMatch(/^(const role = )?await requireStaff\(\);$/);
      expect(second.trim()).toBe("if (!isLandedCostEnabled()) return unavailable();");
    }
  });
});
