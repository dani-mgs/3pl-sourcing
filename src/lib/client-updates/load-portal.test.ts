import { describe, expect, test } from "vitest";
import { loadPortal } from "./load-portal";
import { rowsFor } from "./__fixtures__/portal-rows";

// The portal and "View as client" read through the same SQL: the client via
// my_portal_updates(), staff via portal_updates_for_client(id). Neither ever
// reads client_updates (or any report data) directly. Supabase is a fake
// that records every call.

const CLIENT = "00000000-0000-4000-8000-00000000c001";

function fake(entitlement: { tier: string; valid_until: string | null } | null) {
  const calls: string[] = [];
  const rows = rowsFor("brightline");
  const chain = (table: string) => {
    const c: Record<string, unknown> = {
      select: (cols: string) => {
        calls.push(`select ${table}(${cols})`);
        return c;
      },
      eq: (col: string, v: string) => {
        calls.push(`eq ${col}=${v}`);
        return c;
      },
      in: () => c,
      maybeSingle: async () => ({ data: table === "client_entitlements" ? entitlement : null, error: null }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data:
            table === "profiles"
              ? [
                  { first_name: "Alex Moreno", role: "logistics_expert" },
                  { first_name: "Maya", role: "client" },
                ]
              : [{ owner_id: "o1" }],
          error: null,
        }),
    };
    return c;
  };
  return {
    calls,
    client: {
      rpc: (fn: string, args?: Record<string, unknown>) => {
        calls.push(`rpc ${fn}${args ? ` ${JSON.stringify(args)}` : ""}`);
        const result =
          fn === "my_move_contact_names"
            ? { data: [{ first_name: "Alex" }], error: null }
            : fn.includes("market_report")
              ? { data: [{ engagement_key: "key-brightlineFwd" }], error: null }
              : { data: rows, error: null };
        return {
          select: (cols: string) => {
            calls.push(`rpc ${fn} select(${cols})`);
            return Promise.resolve(result);
          },
          then: (resolve: (v: unknown) => void) => resolve(result),
        };
      },
      from: (table: string) => chain(table),
    },
  };
}

describe("loadPortal", () => {
  test("a client: its own rows through my_portal_updates, its own plan row, never the table", async () => {
    const { client, calls } = fake({ tier: "market_report", valid_until: null });
    const data = await loadPortal(client as never, { as: "client" });
    expect(calls).toContain("rpc my_portal_updates");
    expect(calls).toContain("rpc my_move_contact_names");
    // Requests and replies through the function, never the table.
    expect(calls).toContain("rpc my_client_requests");
    expect(calls.some((c) => c.includes("select client_requests"))).toBe(false);
    expect(calls.filter((c) => c.startsWith("select")).map((c) => c.split("(")[0])).toEqual(["select client_entitlements"]);
    expect(data.tier).toBe("market_report");
    expect(data.contactNames).toEqual(["Alex"]);
    expect(data.engagements).toHaveLength(2);
    // Paid: which projects have a report (keys only, for the link).
    expect(calls).toContain("rpc my_market_reports select(engagement_key)");
    expect(data.reportKeys).toEqual(["key-brightlineFwd"]);
  });

  test("a free client: no report function is called at all", async () => {
    const { client, calls } = fake({ tier: "free", valid_until: null });
    const data = await loadPortal(client as never, { as: "client" });
    expect(calls.some((c) => c.includes("market_report"))).toBe(false);
    expect(data.reportKeys).toEqual([]);
  });

  test("staff: the same rows through portal_updates_for_client for that client, and the same first-name rule", async () => {
    const asClient = await loadPortal(fake(null).client as never, { as: "client" });
    const { client, calls } = fake(null);
    const asStaff = await loadPortal(client as never, { as: "staff", clientId: CLIENT });
    expect(calls).toContain(`rpc portal_updates_for_client {"p_client_id":"${CLIENT}"}`);
    expect(calls).toContain(`rpc client_requests_for_client {"p_client_id":"${CLIENT}"}`);
    expect(calls.some((c) => c.includes("client_updates"))).toBe(false);
    expect(asStaff.engagements).toEqual(asClient.engagements);
    // Staff only, first word only: a client user who owned nothing isn't named.
    expect(asStaff.contactNames).toEqual(["Alex"]);
    expect(asStaff.tier).toBe("free");
    expect(calls.some((c) => c.includes("market_report"))).toBe(false);
  });

  test("staff viewing a paid client: report keys through the staff twin", async () => {
    const { client, calls } = fake({ tier: "market_report", valid_until: null });
    const data = await loadPortal(client as never, { as: "staff", clientId: CLIENT });
    expect(calls).toContain(`rpc market_reports_for_client {"p_client_id":"${CLIENT}"}`);
    expect(data.reportKeys).toEqual(["key-brightlineFwd"]);
  });

  test("an expired paid plan is free", async () => {
    const data = await loadPortal(fake({ tier: "market_report", valid_until: "2020-01-01T00:00:00Z" }).client as never, { as: "client" });
    expect(data.tier).toBe("free");
  });
});
