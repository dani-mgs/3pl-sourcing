import type { createClient } from "@/lib/supabase/server";
import { loadForwarderSource, type ProjectMeta } from "./load-publish-source";
import type { ForwarderSource } from "./build-forwarder-payload";
import type { PartnerIdentity } from "./market-report-guard";
import { suggestRegion, suggestSize } from "./market-report-inputs";
import type { StoredLabels } from "./market-report-labels";
import type { Region, SizeBand } from "./market-report-schema";

// What a Market Report is built from, read as the signed-in staff member
// (RLS applies). The partners' identifying details (website, HQ, email,
// contact) are read only for the "Move's take" guard and the size / region
// suggestions; they never reach the builder. Server-side only.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const IDENTITY_COLUMNS = "id, company_name, website, headquarters, email, contact_person, footprint";

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function toIdentities(rows: Row[]): PartnerIdentity[] {
  return rows.map((r) => ({
    id: String(r.id),
    company_name: String(r.company_name),
    website: str(r.website),
    headquarters: str(r.headquarters),
    email: str(r.email),
    contact_person: str(r.contact_person),
  }));
}

// Fixed-vocabulary suggestions only (the free text stays here).
export function profileHints(rows: Row[]): Map<string, { size: SizeBand | null; region: Region | null }> {
  return new Map(rows.map((r) => [String(r.id), { size: suggestSize(str(r.footprint)), region: suggestRegion(str(r.headquarters)) }]));
}

export function toStoredLabels(rows: Row[]): StoredLabels {
  return {
    byForwarder: new Map(
      rows.filter((r) => r.forwarder_id != null).map((r) => [String(r.forwarder_id), String(r.label)]),
    ),
    used: rows.length,
  };
}

export type ReportRow = { id: string; payload: unknown; inputs: unknown; published_at: string };

export type MarketReportSource = {
  source: ForwarderSource;
  meta: ProjectMeta;
  identities: PartnerIdentity[];
  hints: ReturnType<typeof profileHints>;
  labels: StoredLabels;
  reports: ReportRow[];
};

export async function loadMarketReportSource(supabase: Supabase, projectId: string): Promise<MarketReportSource | null> {
  const [loaded, { data: identityRows }, { data: labelRows }, { data: reports }] = await Promise.all([
    loadForwarderSource(supabase, projectId),
    supabase.from("forwarders").select(IDENTITY_COLUMNS).eq("forwarder_project_id", projectId),
    supabase.from("market_report_partner_labels").select("forwarder_id, label").eq("forwarder_project_id", projectId),
    supabase
      .from("client_market_reports")
      .select("id, payload, inputs, published_at")
      .eq("forwarder_project_id", projectId)
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!loaded) return null;
  const rows = (identityRows ?? []) as Row[];
  return {
    ...loaded,
    identities: toIdentities(rows),
    hints: profileHints(rows),
    labels: toStoredLabels((labelRows ?? []) as Row[]),
    reports: (reports ?? []) as ReportRow[],
  };
}
