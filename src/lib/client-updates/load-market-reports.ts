import type { createClient } from "@/lib/supabase/server";
import type { ClientTier } from "@/lib/admin/parse-admin-input";
import { effectiveTier } from "@/lib/client-tiers";
import { parseMarketReport, type MarketReportPayload } from "./market-report-schema";
import type { PortalViewer } from "./load-portal";

// The one loader behind /portal/market-report and its staff "View as client"
// twin. The plan is read first; on the free plan NOTHING else is read (the
// page is static text). On the paid plan both go through the same SQL
// (market_report_rows, via my_market_reports() for a client or
// market_reports_for_client() for staff): the latest report per project,
// only while the client is on the paid plan. Server-side only.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ReportEntry = { key: string; publishedAt: string; payload: MarketReportPayload | null };

export type ReportLoad =
  | { tier: "free" }
  | {
      tier: Exclude<ClientTier, "free">;
      reports: ReportEntry[];
      // The client's forwarder projects (opaque keys), for "being prepared".
      forwarderKeys: string[];
    };

type Row = { engagement_key: string; published_at: string; payload: unknown };

export async function loadMarketReports(supabase: Supabase, viewer: PortalViewer): Promise<ReportLoad> {
  const entitlement =
    viewer.as === "client"
      ? // RLS: a client reads only its own client's row.
        await supabase.from("client_entitlements").select("tier, valid_until").maybeSingle()
      : await supabase.from("client_entitlements").select("tier, valid_until").eq("client_id", viewer.clientId).maybeSingle();
  const tier = effectiveTier(entitlement.data);
  if (tier === "free") return { tier };

  const [reports, updates] =
    viewer.as === "client"
      ? await Promise.all([
          supabase.rpc("my_market_reports"),
          supabase.rpc("my_portal_updates").select("engagement_key, project_kind"),
        ])
      : await Promise.all([
          supabase.rpc("market_reports_for_client", { p_client_id: viewer.clientId }),
          supabase.rpc("portal_updates_for_client", { p_client_id: viewer.clientId }).select("engagement_key, project_kind"),
        ]);
  if (reports.error) console.error("market report read failed:", reports.error.code);
  const forwarderKeys = [
    ...new Set(
      ((updates.data ?? []) as { engagement_key: string; project_kind: string }[])
        .filter((u) => u.project_kind === "forwarder")
        .map((u) => u.engagement_key),
    ),
  ];
  return {
    tier,
    reports: ((reports.data ?? []) as Row[]).map((r) => ({
      key: r.engagement_key,
      publishedAt: r.published_at,
      payload: parseMarketReport(r.payload),
    })),
    forwarderKeys,
  };
}

export type ReportChoice =
  | { kind: "locked" }
  | { kind: "report"; entry: ReportEntry }
  | { kind: "list"; entries: ReportEntry[] }
  | { kind: "preparing" }
  | { kind: "not_found" };

// Which page to show. A key that isn't one of the client's own projects is
// "not found", exactly like a key that doesn't exist.
export function chooseReport(load: ReportLoad, key: string | null): ReportChoice {
  if (load.tier === "free") return { kind: "locked" };
  if (key) {
    const entry = load.reports.find((r) => r.key === key);
    if (entry) return { kind: "report", entry };
    return load.forwarderKeys.includes(key) ? { kind: "preparing" } : { kind: "not_found" };
  }
  if (load.reports.length === 1) return { kind: "report", entry: load.reports[0] };
  if (load.reports.length > 1) return { kind: "list", entries: load.reports };
  return { kind: "preparing" };
}
