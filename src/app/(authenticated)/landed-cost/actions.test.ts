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
        maybeSingle: async () => ({ data: ownerId ? { owner_id: ownerId } : null, error: null }),
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

const { createWorkspaceAction, deleteWorkspaceAction, exportWorkspaceCsvAction, saveDraftAction } = await import("./actions");

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
  computeWorkspaceResult.mockClear();
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

describe("behind the feature flag", () => {
  test("off: every action refuses with a generic message, before any database call", async () => {
    enabled = false;
    const results = [
      await createWorkspaceAction({ name: "Q4", entryDate: "2026-11-01", scenario }),
      await saveDraftAction(saveInput()),
      await deleteWorkspaceAction({ workspaceId: WORKSPACE }),
      await exportWorkspaceCsvAction({ workspaceId: WORKSPACE }),
    ];
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "unavailable", error: "Landed Cost isn't available yet.", issues: undefined });
    }
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
    expect(loadWorkspace).not.toHaveBeenCalled();
    expect(computeWorkspaceResult).not.toHaveBeenCalled();
  });

  test("every action checks the flag right after requireStaff()", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    const actions = [...source.matchAll(/export async function (\w+)[^{]*\{\n(.*)\n(.*)\n/g)];
    expect(actions.map((a) => a[1])).toEqual(["createWorkspaceAction", "saveDraftAction", "deleteWorkspaceAction", "exportWorkspaceCsvAction"]);
    for (const [, , first, second] of actions) {
      expect(first.trim()).toMatch(/^(const role = )?await requireStaff\(\);$/);
      expect(second.trim()).toBe("if (!isLandedCostEnabled()) return unavailable();");
    }
  });
});
