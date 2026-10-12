import type { createClient } from "@/lib/supabase/server";
import { embeddedOne } from "@/lib/clients";
import { COST_FIELDS } from "@/lib/cost-comparison";
import type { ForwarderSource } from "./build-forwarder-payload";
import type { ThreePlSource } from "./build-three-pl-payload";

// Reads what a client update is built from, as the signed-in staff member
// (RLS applies). The selects name only the columns the builders need, and
// the to*Source functions copy only those fields, so internal free text
// (notes, assessment wording, next action, key notes, sources, contact
// details) never reaches the builders, even if a select were widened.
// Server-side only.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ---- Forwarder ---------------------------------------------------------------

const FORWARDER_PROJECT_COLUMNS = [
  "origin_city",
  "origin_country",
  "destination_city",
  "destination_country",
  "shipment_mode",
  "shipment_type",
  "current_incoterm",
  "final_incoterm",
  "final_shipment_mode",
  "final_shipment_type",
  "current_freight_cost_usd",
  "shipments_per_month",
  "shipments_per_year",
  "project_duration_months",
  "invoice_value",
  "invoice_currency",
  "current_lead_time_days",
  "target_lead_time_days",
] as const;

const QUOTE_COLUMNS = [
  "id",
  "forwarder_id",
  "shipment_mode",
  "shipment_type",
  "incoterm",
  "actual_weight_kg",
  "chargeable_weight_kg",
  "cost_of_goods_usd",
  "original_currency",
  "original_amount",
  "exchange_rate_to_usd",
  "duties_taxes_usd",
  "other_charges_usd",
  "quote_completeness",
  "lead_time_min_days",
  "lead_time_max_days",
  "rate_valid_until",
] as const;

export function toForwarderSource(project: Row, forwarders: Row[], quotes: Row[]): ForwarderSource {
  return {
    project: {
      origin_city: str(project.origin_city),
      origin_country: str(project.origin_country),
      destination_city: str(project.destination_city),
      destination_country: str(project.destination_country),
      shipment_mode: str(project.shipment_mode),
      shipment_type: str(project.shipment_type),
      current_incoterm: str(project.current_incoterm),
      final_incoterm: str(project.final_incoterm),
      final_shipment_mode: str(project.final_shipment_mode),
      final_shipment_type: str(project.final_shipment_type),
      current_freight_cost_usd: num(project.current_freight_cost_usd),
      shipments_per_month: num(project.shipments_per_month),
      shipments_per_year: num(project.shipments_per_year),
      project_duration_months: num(project.project_duration_months),
      invoice_value: num(project.invoice_value),
      invoice_currency: str(project.invoice_currency),
      current_lead_time_days: num(project.current_lead_time_days),
      target_lead_time_days: num(project.target_lead_time_days),
    },
    forwarders: forwarders.map((f) => ({
      id: String(f.id),
      company_name: String(f.company_name),
      status: String(f.status),
      assessment: str(f.assessment),
    })),
    quotes: quotes.map((q) => ({
      id: String(q.id),
      forwarder_id: String(q.forwarder_id),
      shipment_mode: str(q.shipment_mode),
      shipment_type: str(q.shipment_type),
      incoterm: str(q.incoterm),
      actual_weight_kg: num(q.actual_weight_kg),
      chargeable_weight_kg: num(q.chargeable_weight_kg),
      cost_of_goods_usd: num(q.cost_of_goods_usd),
      original_currency: str(q.original_currency) ?? "USD",
      original_amount: num(q.original_amount),
      exchange_rate_to_usd: num(q.exchange_rate_to_usd) ?? 1,
      duties_taxes_usd: num(q.duties_taxes_usd),
      other_charges_usd: num(q.other_charges_usd),
      quote_completeness: str(q.quote_completeness),
      lead_time_min_days: num(q.lead_time_min_days),
      lead_time_max_days: num(q.lead_time_max_days),
      rate_valid_until: str(q.rate_valid_until),
    })),
  };
}

export type ProjectMeta = {
  ownerId: string;
  clientId: string;
  clientName: string;
};

export async function loadForwarderSource(
  supabase: Supabase,
  projectId: string,
): Promise<{ source: ForwarderSource; meta: ProjectMeta } | null> {
  const [{ data: project }, { data: forwarders }, { data: quotes }] = await Promise.all([
    supabase
      .from("forwarder_projects")
      .select(`owner_id, client_id, clients(name), ${FORWARDER_PROJECT_COLUMNS.join(", ")}`)
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("forwarders").select("id, company_name, status, assessment").eq("forwarder_project_id", projectId),
    supabase
      .from("forwarder_quotes")
      .select(`${QUOTE_COLUMNS.join(", ")}, forwarders!inner(forwarder_project_id)`)
      .eq("forwarders.forwarder_project_id", projectId),
  ]);
  if (!project) return null;
  const row = project as unknown as Row;
  return {
    source: toForwarderSource(row, (forwarders ?? []) as Row[], (quotes ?? []) as unknown as Row[]),
    meta: metaOf(row),
  };
}

// ---- 3PL ----------------------------------------------------------------------

export function toThreePlSource(project: Row, providers: Row[], recommendation: Row | null): ThreePlSource {
  const client = embeddedOne(project.clients as Row | Row[] | null);
  return {
    project: {
      target_geography: str(project.target_geography),
      avg_monthly_orders: num(project.avg_monthly_orders),
      contract_period_months: num(project.contract_period_months),
      client_business_model: str(client?.business_model),
    },
    providers: providers.map((p) => ({
      id: String(p.id),
      company_name: String(p.company_name),
      status: String(p.status),
      is_incumbent: p.is_incumbent === true,
      location: str(p.location),
      currency: str(p.currency) ?? "USD",
      ...(Object.fromEntries(COST_FIELDS.map((f) => [f, num(p[f])])) as Record<(typeof COST_FIELDS)[number], number | null>),
    })),
    recommendation: recommendation
      ? {
          priority: String(recommendation.priority),
          provider_id_1: str(recommendation.provider_id_1),
          provider_id_2: str(recommendation.provider_id_2),
          provider_id_3: str(recommendation.provider_id_3),
        }
      : null,
  };
}

export async function loadThreePlSource(
  supabase: Supabase,
  projectId: string,
): Promise<{ source: ThreePlSource; meta: ProjectMeta } | null> {
  const [{ data: project }, { data: providers }, { data: recommendation }] = await Promise.all([
    supabase
      .from("three_pl_projects")
      .select("owner_id, client_id, clients(name, business_model), target_geography, avg_monthly_orders, contract_period_months")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("three_pl_providers")
      .select(`id, company_name, status, is_incumbent, location, currency, ${COST_FIELDS.join(", ")}`)
      .eq("three_pl_project_id", projectId),
    supabase
      .from("recommendation")
      .select("priority, provider_id_1, provider_id_2, provider_id_3")
      .eq("three_pl_project_id", projectId)
      .maybeSingle(),
  ]);
  if (!project) return null;
  const row = project as unknown as Row;
  return {
    source: toThreePlSource(row, (providers ?? []) as unknown as Row[], (recommendation as Row | null) ?? null),
    meta: metaOf(row),
  };
}

function metaOf(project: Row): ProjectMeta {
  const client = embeddedOne(project.clients as Row | Row[] | null);
  return {
    ownerId: String(project.owner_id),
    clientId: String(project.client_id),
    clientName: str(client?.name) ?? "this client",
  };
}

// First names only (profiles.first_name): the portal never shows an email
// read from an account.
export async function loadFirstNames(supabase: Supabase, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)];
  const { data } = await supabase.from("profiles").select("id, first_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.first_name as string | null) ?? null]));
}
