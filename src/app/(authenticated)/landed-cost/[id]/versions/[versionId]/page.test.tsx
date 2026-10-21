import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// A locked version's page is rendered from the stored row only: the
// calculation would throw if anything called it. Bad
// stored data shows "can't be displayed" rather than crashing; flag off, the
// page doesn't exist.

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const VERSION = "00000000-0000-4000-8000-000000000501";
const LOCKER = "00000000-0000-4000-8000-0000000000a1";

let enabled = true;
let storedRow: Record<string, unknown> | null = null;
const reads: string[] = [];
// Every .eq() filter the page applies; the stub returns the stored row only
// when it matches all of them, as the database would.
const filters: [string, unknown][] = [];
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const createClient = vi.fn(async () => ({
  from(table: string) {
    reads.push(table);
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      },
      maybeSingle: async () => {
        const row = storedRow;
        const matches = row != null && filters.every(([column, value]) => row[column] === value);
        return { data: matches ? row : null, error: null };
      },
    };
    return chain;
  },
}));
const recalculated = vi.fn(() => {
  throw new Error("a locked version must not be recalculated");
});

vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({}) }));
vi.mock("@/lib/landed-cost/feature-flag", () => ({ isLandedCostEnabled: () => enabled }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/landed-cost/server-compute", () => ({ computeWorkspaceResult: recalculated }));
vi.mock("@/lib/landed-cost/server-workspace-list", () => ({ loadFirstNames: async () => new Map([[LOCKER, "Dani"]]) }));

const { default: LockedVersionPage } = await import("./page");

// The golden China vs Vietnam case, locked: built by the real pipeline, stored as JSON.
async function lockedRow(): Promise<Record<string, unknown>> {
  const { computeWorkspaceResult } = await vi.importActual<typeof import("@/lib/landed-cost/server-compute")>("@/lib/landed-cost/server-compute");
  const { stubSupabase } = await import("@/lib/tariff/__fixtures__/supabase-stub");
  const { CALCULATED_ON } = await import("@/lib/landed-cost/__fixtures__/duty-tables");
  const { scenario, tables, vietnamScenario, workspace } = await import("@/lib/landed-cost/__fixtures__/workspace-builders");
  const { buildSnapshotRow } = await import("@/lib/landed-cost/snapshot-schema");
  const w = workspace({ id: WORKSPACE, ownerId: LOCKER, scenarios: [scenario(), vietnamScenario()] });
  const built = buildSnapshotRow(w, await computeWorkspaceResult(stubSupabase(tables()) as never, w, CALCULATED_ON));
  if (!built.ok) throw new Error(built.error);
  const r = built.row;
  return JSON.parse(
    JSON.stringify({
      id: VERSION, workspace_id: WORKSPACE, version_no: 3, created_at: "2026-10-02T09:30:00.123456+00:00", created_by: LOCKER,
      as_of_date: r.as_of_date, workspace_name: r.workspace_name, entry_date: r.entry_date, hts_release_name: r.hts_release_name,
      hts_release_title: r.hts_release_title, hts_release_start_date: r.hts_release_start_date, schema_version: r.schema_version,
      inputs: r.inputs, result: r.result, incomplete: r.incomplete,
    }),
  );
}
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000002";
const render = async (id = WORKSPACE, versionId = VERSION) =>
  renderToStaticMarkup(await LockedVersionPage({ params: Promise.resolve({ id, versionId }) } as never));

beforeEach(() => {
  enabled = true;
  reads.length = 0;
  filters.length = 0;
  createClient.mockClear();
  recalculated.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("a locked version", () => {
  test("rendered from the stored row only: header, comparison and result, nothing recalculated", async () => {
    storedRow = await lockedRow();
    const html = await render();
    expect(html).toContain("Locked version v3, locked on");
    expect(html).toContain("by Dani");
    expect(html).toContain("Duty data as of");
    expect(html).toContain("China is $2.34/unit cheaper than Vietnam (11.9%).");
    expect(html).toContain("$17.35");
    expect(html).toContain("Not recalculated.");
    expect(html).toContain("Read-only");
    expect(html).toContain("Download PDF");
    expect(html).toContain("Export CSV");
    expect(html).not.toContain("As of your last save");
    expect(html).not.toMatch(/<input|<textarea/);
    expect(recalculated).not.toHaveBeenCalled();
    expect(reads).toEqual(["landed_cost_snapshots"]);
  });

  test("stored data that doesn't match the schema: 'can't be displayed', no crash", async () => {
    const row = await lockedRow();
    (row.result as { origins: { totalUsd: unknown }[] }).origins[0].totalUsd = 1734.73;
    storedRow = row;
    const html = await render();
    expect(html).toContain("This version can&#x27;t be displayed");
    expect(html).toContain("Locked version v3");
    expect(html).not.toContain("Download PDF");
    expect(recalculated).not.toHaveBeenCalled();
  });

  test("a version that isn't there is a 404", async () => {
    storedRow = null;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("scoped to the workspace in the URL: another workspace's version is a 404", async () => {
    // Version B (stored under OTHER_WORKSPACE) requested under workspace A.
    storedRow = { ...(await lockedRow()), workspace_id: OTHER_WORKSPACE };
    await expect(render(WORKSPACE, VERSION)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(filters).toEqual(expect.arrayContaining([["id", VERSION], ["workspace_id", WORKSPACE]]));

    // The matching pair still renders.
    filters.length = 0;
    const html = await render(OTHER_WORKSPACE, VERSION);
    expect(html).toContain("Locked version v3");
    expect(filters).toEqual(expect.arrayContaining([["id", VERSION], ["workspace_id", OTHER_WORKSPACE]]));
  });

  test("flag off: a 404 before any read", async () => {
    enabled = false;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createClient).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });
});
