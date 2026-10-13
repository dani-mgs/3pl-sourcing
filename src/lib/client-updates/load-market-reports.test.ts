import { describe, expect, test } from "vitest";
import { chooseReport, loadMarketReports, type ReportLoad } from "./load-market-reports";
import { fixtureReport } from "./__fixtures__/market-report";

// The Market Report page and "View as client" read through the same SQL:
// the client via my_market_reports(), staff via market_reports_for_client(id).
// On the free plan nothing but the plan row is read. Supabase is a fake that
// records every call.

const CLIENT = "00000000-0000-4000-8000-00000000c001";

function fake(entitlement: { tier: string; valid_until: string | null } | null) {
  const calls: string[] = [];
  const results: Record<string, unknown[]> = {
    my_market_reports: [{ engagement_key: "k-fwd", published_at: "2026-10-10T10:00:00Z", payload: fixtureReport() }],
    market_reports_for_client: [{ engagement_key: "k-fwd", published_at: "2026-10-10T10:00:00Z", payload: fixtureReport() }],
    my_portal_updates: [
      { engagement_key: "k-fwd", project_kind: "forwarder" },
      { engagement_key: "k-fwd2", project_kind: "forwarder" },
      { engagement_key: "k-3pl", project_kind: "three_pl" },
    ],
    portal_updates_for_client: [{ engagement_key: "k-fwd", project_kind: "forwarder" }],
  };
  const table = (name: string) => {
    const c: Record<string, unknown> = {
      select: (cols: string) => {
        calls.push(`select ${name}(${cols})`);
        return c;
      },
      eq: (col: string, v: string) => {
        calls.push(`eq ${col}=${v}`);
        return c;
      },
      maybeSingle: async () => ({ data: entitlement, error: null }),
    };
    return c;
  };
  return {
    calls,
    client: {
      from: table,
      rpc: (fn: string, args?: Record<string, unknown>) => {
        calls.push(`rpc ${fn}${args ? ` ${JSON.stringify(args)}` : ""}`);
        const result = { data: results[fn] ?? [], error: null };
        return {
          select: (cols: string) => {
            calls.push(`rpc ${fn} select(${cols})`);
            return Promise.resolve(result);
          },
          then: (resolve: (v: unknown) => void) => resolve(result),
        };
      },
    },
  };
}

describe("loadMarketReports", () => {
  test("free plan: only the plan row is read, never a report", async () => {
    const { client, calls } = fake({ tier: "free", valid_until: null });
    expect(await loadMarketReports(client as never, { as: "client" })).toEqual({ tier: "free" });
    expect(calls).toEqual(["select client_entitlements(tier, valid_until)"]);
  });

  test("an expired paid plan is free: nothing else is read", async () => {
    const { client, calls } = fake({ tier: "market_report", valid_until: "2020-01-01T00:00:00Z" });
    expect(await loadMarketReports(client as never, { as: "client" })).toEqual({ tier: "free" });
    expect(calls.some((c) => c.startsWith("rpc"))).toBe(false);
  });

  test("a paid client: its reports through my_market_reports, never a table", async () => {
    const { client, calls } = fake({ tier: "market_report", valid_until: null });
    const load = await loadMarketReports(client as never, { as: "client" });
    expect(calls).toContain("rpc my_market_reports");
    expect(calls.filter((c) => c.startsWith("select")).map((c) => c.split("(")[0])).toEqual(["select client_entitlements"]);
    expect(load.tier === "market_report" && load.reports.map((r) => [r.key, r.payload?.partners.length])).toEqual([["k-fwd", 12]]);
    expect(load.tier === "market_report" && load.forwarderKeys).toEqual(["k-fwd", "k-fwd2"]);
  });

  test("staff: the same through market_reports_for_client for that client", async () => {
    const { client, calls } = fake({ tier: "market_report", valid_until: null });
    const asStaff = await loadMarketReports(client as never, { as: "staff", clientId: CLIENT });
    expect(calls).toContain(`rpc market_reports_for_client {"p_client_id":"${CLIENT}"}`);
    expect(calls).toContain(`eq client_id=${CLIENT}`);
    const asClient = await loadMarketReports(fake({ tier: "market_report", valid_until: null }).client as never, { as: "client" });
    expect(asStaff.tier === "market_report" && asStaff.reports).toEqual(asClient.tier === "market_report" && asClient.reports);
  });

  test("a row that doesn't parse is kept as unreadable, never shown raw", async () => {
    const { client } = fake({ tier: "market_report", valid_until: null });
    const load = await loadMarketReports(client as never, { as: "client" });
    expect(load.tier === "market_report" && load.reports[0].payload).not.toBeNull();
  });
});

describe("chooseReport", () => {
  const entry = { key: "k-fwd", publishedAt: "2026-10-10T10:00:00Z", payload: null };
  const paid = (reports = [entry], forwarderKeys = ["k-fwd", "k-fwd2"]): ReportLoad => ({ tier: "market_report", reports, forwarderKeys });

  test.each([
    ["free, any key", { tier: "free" } as ReportLoad, "k-fwd", "locked"],
    ["free, no key", { tier: "free" } as ReportLoad, null, "locked"],
    ["paid, its report", paid(), "k-fwd", "report"],
    ["paid, its project without a report", paid(), "k-fwd2", "preparing"],
    ["paid, someone else's key", paid(), "k-other", "not_found"],
    ["paid, its 3PL project's key", paid([entry], ["k-fwd"]), "k-3pl", "not_found"],
    ["paid, no key, one report", paid(), null, "report"],
    ["paid, no key, two reports", paid([entry, { ...entry, key: "k-fwd2" }]), null, "list"],
    ["paid, no key, no report", paid([]), null, "preparing"],
  ])("%s", (_, load, key, kind) => {
    expect(chooseReport(load, key).kind).toBe(kind);
  });
});
