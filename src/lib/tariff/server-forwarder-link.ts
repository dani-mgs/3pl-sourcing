import type { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { embeddedOne } from "@/lib/clients";
import { quoteTitle } from "@/lib/forwarder/quote-label";
import { defaultEntryDate } from "./entry-date";
import {
  LINK_PROJECT_COLUMNS,
  buildInputSnapshot,
  buildPrefill,
  htsLookupInput,
  invoiceIncludesFreight,
  normalizeProject,
  type HtsLookup,
  type InputSnapshot,
  type LinkProject,
  type LinkQuote,
  type Prefill,
  type SnapshotChoices,
} from "./forwarder-link";
import type { LatestRates } from "@/lib/fx/rate-provenance";
import { missingConfirmation, type EstimateFormData, type LinkFields } from "./parse-estimate-form";
import { parseRateText } from "./rate-text";
import { findLine } from "./server-estimate";

// Server reads behind "Estimate duties" from Forwarder Sourcing: the project
// and quote a linked estimate is built from, the HTS lookup for the
// project's code, and the checks a linked preview or save must pass. Reads go
// through the signed-in user's client (forwarder data and the HTS are
// readable by any signed-in user); writing a linked estimate is limited to
// the project's owner or an admin, here and in RLS.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LinkSources = {
  project: LinkProject;
  quote: LinkQuote | null;
  clientName: string;
};

const QUOTE_COLUMNS =
  "id, updated_at, forwarder_id, incoterm, shipment_mode, shipment_type, origin, destination, cost_of_goods_usd, duties_taxes_usd, " +
  "lead_time_min_days, lead_time_max_days, forwarders!inner(company_name, forwarder_project_id)";

type QuoteRow = {
  id: string;
  updated_at: string;
  forwarder_id: string;
  incoterm: string | null;
  shipment_mode: string | null;
  shipment_type: string | null;
  origin: string | null;
  destination: string | null;
  cost_of_goods_usd: number | string | null;
  duties_taxes_usd: number | string | null;
  lead_time_min_days: number | string | null;
  lead_time_max_days: number | string | null;
  forwarders: { company_name: string; forwarder_project_id: string } | { company_name: string; forwarder_project_id: string }[];
};

const toNumber = (v: number | string | null) => (v == null ? null : Number(v));

export function quoteFromRow(row: QuoteRow): LinkQuote {
  const forwarder = embeddedOne(row.forwarders);
  return {
    id: row.id,
    updated_at: row.updated_at,
    forwarder_id: row.forwarder_id,
    forwarder_name: forwarder?.company_name ?? "",
    label: quoteTitle(row),
    shipment_mode: row.shipment_mode,
    cost_of_goods_usd: toNumber(row.cost_of_goods_usd),
    duties_taxes_usd: toNumber(row.duties_taxes_usd),
    lead_time_min_days: toNumber(row.lead_time_min_days),
    lead_time_max_days: toNumber(row.lead_time_max_days),
  };
}

// Null when the project doesn't exist, or the quote isn't one of its quotes.
export async function loadLinkSources(
  supabase: Supabase,
  projectId: string,
  quoteId: string | null,
): Promise<LinkSources | null> {
  const [projectResult, quoteResult] = await Promise.all([
    supabase.from("forwarder_projects").select(`${LINK_PROJECT_COLUMNS}, clients(name)`).eq("id", projectId).maybeSingle(),
    quoteId
      ? supabase
          .from("forwarder_quotes")
          .select(QUOTE_COLUMNS)
          .eq("id", quoteId)
          .eq("forwarders.forwarder_project_id", projectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (projectResult.error) throw projectResult.error;
  if (quoteResult.error) throw quoteResult.error;
  if (!projectResult.data) return null;
  if (quoteId && !quoteResult.data) return null;

  const row = projectResult.data as unknown as Record<string, unknown>;
  const client = embeddedOne(row.clients as { name: string } | { name: string }[] | null);
  return {
    project: normalizeProject(row),
    quote: quoteResult.data ? quoteFromRow(quoteResult.data as unknown as QuoteRow) : null,
    clientName: client?.name ?? "—",
  };
}

export function sourceVersion(sources: Pick<LinkSources, "project" | "quote">): string {
  return `${sources.project.updated_at}|${sources.quote?.updated_at ?? ""}`;
}

// The project's HS code looked up in the current HTS release, for the
// description shown beside the suggestion and the rate's unit.
export async function lookupHtsCode(supabase: Supabase, hsCode: string | null): Promise<HtsLookup> {
  const input = htsLookupInput(hsCode);
  if ("status" in input) return input;
  const { data: release, error } = await supabase
    .from("hts_releases")
    .select("id")
    .eq("status", "current")
    .maybeSingle();
  if (error) throw error;
  if (!release) return { status: "not_found", digits: input.digits };

  const found = await findLine(supabase, release.id, input.digits);
  if (!found) return { status: "not_found", digits: input.digits };
  if ("error" in found) return { status: "several", digits: input.digits, description: null };
  const parsed = parseRateText(found.line.general_rate);
  return {
    status: "found",
    digits: found.line.hts_code,
    description: found.line.description,
    ancestorDescriptions: found.line.ancestor_descriptions ?? [],
    perUnit:
      parsed.kind === "rate" && parsed.specific
        ? { unit: parsed.specific.unit, unitLabel: parsed.specific.unitLabel }
        : null,
  };
}

const sameAmount = (text: string, value: number | null) =>
  value != null && Math.round(Number(text) * 100) === Math.round(value * 100);

// Which of the suggestions the confirmed values match. Worked out on the
// server from what was submitted, so the snapshot never trusts the browser.
export function snapshotChoices(
  input: EstimateFormData,
  sources: Pick<LinkSources, "project" | "quote">,
  today: string,
): SnapshotChoices {
  const { project, quote } = sources;
  const customs_value_basis =
    input.currency === project.invoice_currency && sameAmount(input.customsValue, project.invoice_value)
      ? "invoice"
      : input.currency === "USD" && sameAmount(input.customsValue, quote?.cost_of_goods_usd ?? null)
        ? "quote_cost_of_goods"
        : "entered";
  const quantity_from =
    input.quantity == null
      ? null
      : Number(input.quantity) === project.weight_kg
        ? "weight_kg"
        : Number(input.quantity) === project.units
          ? "units"
          : null;
  const suggested = defaultEntryDate(today, quote?.lead_time_min_days, quote?.lead_time_max_days);
  const entry_date_from =
    input.entryDate === suggested.date ? suggested.from : input.entryDate === today ? "today" : "entered";
  return {
    customs_value_basis,
    deduction_offered: invoiceIncludesFreight(project.current_incoterm),
    quantity_from,
    entry_date_from,
  } satisfies SnapshotChoices;
}

export type CheckedLink =
  | {
      ok: true;
      input: EstimateFormData;
      sources: LinkSources;
      row: { forwarder_project_id: string; forwarder_quote_id: string | null; input_snapshot: InputSnapshot };
    }
  | { ok: false; error: string };

export const NOT_ALLOWED =
  "Only the project's owner or an admin can create duty estimates for it. You can still use the calculator without linking.";
export const SOURCES_CHANGED =
  "The project or quote changed while you were editing. Reload the page to see the new values, then confirm them again.";

// Everything a linked preview or save must pass: the user can write to the
// project, the project and quote still exist and haven't changed since the
// page was loaded, a deduction is only taken when the incoterm calls for it,
// and every input has been confirmed (`today` is the day of calculation, for
// where the entry date came from). Returns the input with the deduction
// and the row's link columns and snapshot.
export async function checkLinkedEstimate(
  supabase: Supabase,
  input: EstimateFormData,
  link: LinkFields,
  today: string,
  action: "calculating" | "saving" = "calculating",
): Promise<CheckedLink> {
  const { canWrite } = await getOwnershipContext(link.projectId, "forwarder_projects");
  if (!canWrite) return { ok: false, error: NOT_ALLOWED };

  const sources = await loadLinkSources(supabase, link.projectId, link.quoteId);
  if (!sources) return { ok: false, error: "The project or quote no longer exists." };
  if (sourceVersion(sources) !== link.sourceVersion) return { ok: false, error: SOURCES_CHANGED };

  const deductionOffered = invoiceIncludesFreight(sources.project.current_incoterm);
  if (!deductionOffered && link.deductionUsd != null) {
    return {
      ok: false,
      error: "The project's current incoterm doesn't include international freight in the price, so nothing is deducted.",
    };
  }
  const missing = missingConfirmation(link.confirmed, { deductionOffered, quantityEntered: input.quantity != null }, action);
  if (missing) return { ok: false, error: missing };

  const withDeduction = { ...input, deductionUsd: link.deductionUsd };
  return {
    ok: true,
    input: withDeduction,
    sources,
    row: {
      forwarder_project_id: link.projectId,
      forwarder_quote_id: link.quoteId,
      input_snapshot: buildInputSnapshot(sources.project, sources.quote, snapshotChoices(withDeduction, sources, today)),
    },
  };
}

// What the calculator page needs to open pre-filled from a project or quote.
export type LinkedFormContext = {
  projectId: string;
  quoteId: string | null;
  sourceVersion: string;
  // "Client A" or "Client A · Acme Freight · Sea FCL"
  title: string;
  backHref: string;
  // The forwarder's quoted duties, shown for reference (quotes only).
  quotedDutiesUsd: number | null;
  prefill: Prefill;
};

export type LinkContextResult =
  | { status: "ok"; context: LinkedFormContext }
  | { status: "not_allowed" }
  | { status: "not_found" };

export async function loadLinkContext(
  supabase: Supabase,
  projectId: string,
  quoteId: string | null,
  latestRates: LatestRates,
  today: string,
): Promise<LinkContextResult> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(projectId) || (quoteId != null && !UUID.test(quoteId))) return { status: "not_found" };
  const [sources, { canWrite }] = await Promise.all([
    loadLinkSources(supabase, projectId, quoteId),
    getOwnershipContext(projectId, "forwarder_projects"),
  ]);
  if (!sources) return { status: "not_found" };
  if (!canWrite) return { status: "not_allowed" };

  const hts = await lookupHtsCode(supabase, sources.project.hs_code);
  const { project, quote } = sources;
  return {
    status: "ok",
    context: {
      projectId,
      quoteId,
      sourceVersion: sourceVersion(sources),
      title: [sources.clientName, quote?.forwarder_name, quote?.label].filter(Boolean).join(" · "),
      backHref: quote
        ? `/forwarder-sourcing/${projectId}/forwarders/${quote.forwarder_id}`
        : `/forwarder-sourcing/${projectId}`,
      quotedDutiesUsd: quote?.duties_taxes_usd ?? null,
      prefill: buildPrefill({ project, quote, hts, latestRates, today }),
    },
  };
}
