import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSupabaseStub, stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { LIST_LIMIT, listWorkspaces } from "./server-workspace-list";

// The workspace list: owner first names only (never an email), the
// baseline's origin, SKU counts, and at most LIST_LIMIT rows.

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const ws = (n: number, over: Record<string, unknown> = {}) => ({
  id: `w${n}`, owner_id: "u1", name: `W${n}`, entry_date: "2026-11-01", updated_at: "2026-10-21T02:02:38.123456+00:00",
  baseline_scenario_id: `s${n}`, ...over,
});

const tables = () => ({
  landed_cost_workspaces: [ws(1), ws(2, { owner_id: "u2", baseline_scenario_id: null }), ws(3, { owner_id: "u3" })],
  landed_cost_scenarios: [
    { id: "s1", workspace_id: "w1", origin_country: "CN", sort_order: 1 },
    { id: "x1", workspace_id: "w1", origin_country: "VN", sort_order: 0 },
    { id: "s2b", workspace_id: "w2", origin_country: "MX", sort_order: 0 },
  ],
  landed_cost_sku_lines: [
    { id: "l1", workspace_id: "w1" },
    { id: "l2", workspace_id: "w1" },
    { id: "l3", workspace_id: "w2" },
  ],
  profiles: [
    { id: "u1", first_name: "Dani", email: "dani@test.local" },
    { id: "u2", first_name: null, email: "u2@test.local" },
  ],
});

describe("listWorkspaces", () => {
  test("names, origins and counts", async () => {
    const list = await listWorkspaces(stubSupabase(tables()));
    if (!list.ok) throw new Error(list.message);
    expect(list.more).toBe(false);
    expect(list.rows).toEqual([
      { id: "w1", name: "W1", ownerName: "Dani", entryDate: "Nov 1, 2026", origin: "China", skuCount: 2, updated: "Oct 21, 2026" },
      // No baseline set: the first scenario's origin.
      { id: "w2", name: "W2", ownerName: "Staff", entryDate: "Nov 1, 2026", origin: "Mexico", skuCount: 1, updated: "Oct 21, 2026" },
      // No profile: "Unknown user", and no scenario: said so.
      { id: "w3", name: "W3", ownerName: "Unknown user", entryDate: "Nov 1, 2026", origin: "No scenario", skuCount: 0, updated: "Oct 21, 2026" },
    ]);
    expect(JSON.stringify(list.rows)).not.toContain("@");
  });

  test(`at most ${LIST_LIMIT} rows, saying there are more`, async () => {
    const many = Array.from({ length: LIST_LIMIT + 5 }, (_, i) => ws(i + 10));
    const list = await listWorkspaces(stubSupabase({ ...tables(), landed_cost_workspaces: many }));
    if (!list.ok) throw new Error(list.message);
    expect(list.rows).toHaveLength(LIST_LIMIT);
    expect(list.more).toBe(true);
  });

  test("empty, and a failed read with a plain message", async () => {
    const empty = await listWorkspaces(stubSupabase({ ...tables(), landed_cost_workspaces: [] }));
    expect(empty).toEqual({ ok: true, rows: [], more: false });
    const failed = await listWorkspaces(createSupabaseStub(tables(), { failOn: "landed_cost_sku_lines" }).client);
    expect(failed).toEqual({ ok: false, message: "The workspaces couldn't be loaded right now. Try again." });
  });
});
