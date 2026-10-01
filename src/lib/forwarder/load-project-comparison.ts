import type { createClient } from "@/lib/supabase/server";
import { embeddedOne } from "@/lib/clients";
import { FORWARDER_PROJECT_FIELDS_SELECT } from "./parse-project-form";
import { QUOTE_FIELDS_SELECT, type QuoteFields } from "./parse-quote-form";
import {
  buildForwarderCostComparison,
  type ForwarderProjectTerms,
  type ForwarderQuoteInput,
  type ForwarderQuoteResult,
} from "./cost-comparison";
import type { RateSource } from "@/lib/fx/rate-provenance";

// One place that loads a forwarder project and ranks ALL of its quotes, used
// by both the Project Summary and the forwarder detail page. Rank and savings
// only mean something across every forwarder's quotes in the project, so the
// detail page must never rank a single forwarder's quotes on their own.
// Server-side only: it takes the server Supabase client.

export type ComparisonQuote = ForwarderQuoteInput & {
  id: string;
  forwarder_id: string;
  forwarder_name: string;
  lead_time_min_days: number | null;
  lead_time_max_days: number | null;
  rate_valid_until: string | null;
  // How the converted USD figures were locked (null for USD quotes).
  exchange_rate_source: RateSource | null;
  exchange_rate_date: string | null;
};

export type ComparisonResult = ForwarderQuoteResult<ComparisonQuote>;

// Free-text and bookkeeping fields shown when a quote row is expanded on the
// forwarder detail page. Only loaded out for that forwarder's own quotes.
export type QuoteDetails = Pick<
  QuoteFields,
  | "key_strength"
  | "key_weakness_risk"
  | "important_assumption"
  | "overall_assessment"
  | "client_decision"
  | "notes"
> & { updated_at: string };

export type ProjectRow = Record<string, unknown> & {
  id: string;
  status: string;
  updated_at: string;
  clients: unknown;
};

export type ProjectComparison = {
  project: ProjectRow;
  quotes: ComparisonQuote[];
  results: ComparisonResult[];
  effectiveAnnualShipments: number | null;
  // Keyed by quote id; empty unless detailsForForwarderId was passed.
  details: Map<string, QuoteDetails>;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The select strings are built at runtime, so Supabase can't infer columns
// from the literal type; the Zod-derived types are the real contract.
type QuoteQueryRow = QuoteFields & {
  id: string;
  forwarder_id: string;
  updated_at: string;
  // Object or single-item array depending on the join shape.
  forwarders:
    | { company_name: string; status: string }
    | { company_name: string; status: string }[]
    | null;
};

// Returns null when the project doesn't exist or isn't readable (RLS).
export async function loadProjectComparison(
  supabase: Supabase,
  projectId: string,
  detailsForForwarderId?: string,
): Promise<ProjectComparison | null> {
  const [{ data: project }, { data: quoteRows }] = await Promise.all([
    supabase
      .from("forwarder_projects")
      .select(`id, updated_at, clients(name, business_model), ${FORWARDER_PROJECT_FIELDS_SELECT}`)
      .eq("id", projectId)
      .single(),
    supabase
      .from("forwarder_quotes")
      .select(
        `id, forwarder_id, updated_at, ${QUOTE_FIELDS_SELECT}, forwarders!inner(company_name, status, forwarder_project_id)`,
      )
      .eq("forwarders.forwarder_project_id", projectId),
  ]);
  if (!project) return null;

  const details = new Map<string, QuoteDetails>();
  const quotes: ComparisonQuote[] = [];
  for (const q of (quoteRows ?? []) as unknown as QuoteQueryRow[]) {
    const forwarder = embeddedOne(q.forwarders);
    if (!forwarder) continue;
    // Only the fields the comparison needs: these objects reach client
    // components, so other forwarders' notes and free text stay on the server.
    quotes.push({
      id: q.id,
      forwarder_id: q.forwarder_id,
      forwarder_name: forwarder.company_name,
      forwarder_status: forwarder.status,
      scenario_group: q.scenario_group,
      shipment_mode: q.shipment_mode,
      shipment_type: q.shipment_type,
      incoterm: q.incoterm,
      actual_weight_kg: q.actual_weight_kg,
      chargeable_weight_kg: q.chargeable_weight_kg,
      cost_of_goods_usd: q.cost_of_goods_usd,
      original_currency: q.original_currency,
      original_amount: q.original_amount,
      exchange_rate_to_usd: q.exchange_rate_to_usd,
      duties_taxes_usd: q.duties_taxes_usd,
      other_charges_usd: q.other_charges_usd,
      quote_completeness: q.quote_completeness,
      lead_time_min_days: q.lead_time_min_days,
      lead_time_max_days: q.lead_time_max_days,
      rate_valid_until: q.rate_valid_until,
      exchange_rate_source: (q.exchange_rate_source as RateSource | null) ?? null,
      exchange_rate_date: q.exchange_rate_date,
    });
    if (detailsForForwarderId && q.forwarder_id === detailsForForwarderId) {
      details.set(q.id, {
        key_strength: q.key_strength,
        key_weakness_risk: q.key_weakness_risk,
        important_assumption: q.important_assumption,
        overall_assessment: q.overall_assessment,
        client_decision: q.client_decision,
        notes: q.notes,
        updated_at: q.updated_at,
      });
    }
  }

  const row = project as unknown as ProjectRow;
  const { effectiveAnnualShipments, results } = buildForwarderCostComparison(
    row as unknown as ForwarderProjectTerms,
    quotes,
  );
  return { project: row, quotes, results, effectiveAnnualShipments, details };
}
