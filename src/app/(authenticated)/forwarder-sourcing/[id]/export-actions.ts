"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { embeddedOne } from "@/lib/clients";
import { formatCurrency } from "@/lib/currency";
import { buildCsv, sanitizeFilename } from "@/lib/forwarder/export-csv";
import { FORWARDER_PROJECT_FIELDS_SELECT } from "@/lib/forwarder/parse-project-form";
import { PROJECT_SECTIONS } from "@/lib/forwarder/project-sections";
import { formatProjectValue } from "@/lib/forwarder/project-display";
import { CAPABILITY_FIELDS } from "@/lib/forwarder/forwarder-fields";
import { FORWARDER_FIELDS_SELECT, type ForwarderFields } from "@/lib/forwarder/parse-forwarder-form";
import { QUOTE_FIELDS_SELECT, type QuoteFields } from "@/lib/forwarder/parse-quote-form";
import {
  NOT_COMPARABLE,
  buildForwarderCostComparison,
  isExcludedFromRanking,
  type ForwarderProjectTerms,
  type ForwarderQuoteResult,
} from "@/lib/forwarder/cost-comparison";

// Reads are open to every authenticated user project-wide (PROJECT_STATE.md
// §8) — the Project Summary page itself has no read-side ownership gate, only
// writes do, so these exports don't check getOwnershipContext/canWrite
// either. Anyone who can already see this data in the UI can already read
// every field going into these CSVs; this is a read-only export of it, not a
// new capability.

export type ExportVersion = "client" | "expert";
export type ExportCsvState = { csv: string; filename: string } | { error: string };

const uuid = z.string().uuid();
const UNEXPECTED = "An unexpected error occurred.";

type Column<T> = {
  header: string;
  tier: "client" | "expert";
  value: (row: T) => string | number | null;
};

function buildSectionCsv<T>(
  columns: Column<T>[],
  version: ExportVersion,
  rows: T[],
): string {
  const cols = version === "expert" ? columns : columns.filter((c) => c.tier === "client");
  return buildCsv(
    cols.map((c) => c.header),
    rows.map((row) => cols.map((c) => c.value(row))),
  );
}

// formatProjectValue returns "—" for an empty field on the page; a CSV should
// just be blank there instead.
function blankDash(text: string): string | null {
  return text === "—" ? null : text;
}

// ---- Project Details --------------------------------------------------

type ProjectExportRow = Record<string, unknown> & {
  clientName: string | null;
  businessModel: string | null;
  status: string;
};

function projectColumns(): Column<ProjectExportRow>[] {
  const columns: Column<ProjectExportRow>[] = [
    { header: "Client Name", tier: "client", value: (r) => r.clientName },
    { header: "Business Model", tier: "client", value: (r) => r.businessModel },
    { header: "Project Status", tier: "expert", value: (r) => r.status },
  ];
  for (const section of PROJECT_SECTIONS) {
    for (const field of section.fields) {
      columns.push({
        header: field.label,
        tier: "client",
        value: (r) => blankDash(formatProjectValue(field, r)),
      });
    }
  }
  return columns;
}

export async function exportProjectCsv(
  projectId: string,
  version: ExportVersion,
): Promise<ExportCsvState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("forwarder_projects")
    .select(`id, status, clients(name, business_model), ${FORWARDER_PROJECT_FIELDS_SELECT}`)
    .eq("id", projectId)
    .single();

  if (error || !project) {
    console.error("exportProjectCsv fetch error:", error);
    return { error: UNEXPECTED };
  }

  const row = project as unknown as Record<string, unknown> & { status: string; clients: unknown };
  const client = embeddedOne(
    row.clients as { name: string; business_model: string | null } | null,
  );
  const exportRow: ProjectExportRow = {
    ...row,
    clientName: client?.name ?? null,
    businessModel: client?.business_model ?? null,
    status: row.status,
  };

  const csv = buildSectionCsv(projectColumns(), version, [exportRow]);
  return { csv, filename: `${sanitizeFilename(client?.name ?? "project")}-project-details-${version}.csv` };
}

// ---- Forwarders ---------------------------------------------------------

function forwarderColumns(): Column<ForwarderFields>[] {
  const columns: Column<ForwarderFields>[] = [
    { header: "Company Name", tier: "client", value: (r) => r.company_name },
    { header: "Website", tier: "client", value: (r) => r.website },
    { header: "Headquarters", tier: "client", value: (r) => r.headquarters },
    { header: "Footprint", tier: "client", value: (r) => r.footprint },
    { header: "Origin Coverage", tier: "client", value: (r) => r.origin_coverage },
    { header: "Destination Coverage", tier: "client", value: (r) => r.destination_coverage },
    { header: "Other Services", tier: "client", value: (r) => r.other_services },
  ];
  for (const capability of CAPABILITY_FIELDS) {
    columns.push({
      header: capability.label,
      tier: "client",
      value: (r) => (r[capability.name] ? "Yes" : "No"),
    });
  }
  columns.push(
    // Identify a specific person at the forwarder — same sensitivity class
    // as email/phone, so Expert-only alongside them.
    { header: "Contact Person", tier: "expert", value: (r) => r.contact_person },
    { header: "Contact Position", tier: "expert", value: (r) => r.contact_position },
    { header: "Email", tier: "expert", value: (r) => r.email },
    { header: "Phone", tier: "expert", value: (r) => r.phone },
    { header: "Status", tier: "expert", value: (r) => r.status },
    { header: "Assessment", tier: "expert", value: (r) => r.assessment },
    { header: "Next Action", tier: "expert", value: (r) => r.next_action },
    { header: "Key Notes", tier: "expert", value: (r) => r.key_notes },
  );
  return columns;
}

export async function exportForwardersCsv(
  projectId: string,
  version: ExportVersion,
): Promise<ExportCsvState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const supabase = await createClient();
  const [{ data: project }, { data: forwarderRows, error }] = await Promise.all([
    supabase.from("forwarder_projects").select("clients(name)").eq("id", projectId).single(),
    supabase
      .from("forwarders")
      .select(FORWARDER_FIELDS_SELECT)
      .eq("forwarder_project_id", projectId)
      .order("company_name", { ascending: true }),
  ]);

  if (error) {
    console.error("exportForwardersCsv fetch error:", error);
    return { error: UNEXPECTED };
  }

  const client = embeddedOne(
    (project as unknown as { clients: unknown } | null)?.clients as
      | { name: string }
      | null,
  );
  const forwarders = (forwarderRows ?? []) as unknown as ForwarderFields[];
  const csv = buildSectionCsv(forwarderColumns(), version, forwarders);
  return { csv, filename: `${sanitizeFilename(client?.name ?? "project")}-forwarders-${version}.csv` };
}

// ---- Quote Comparison -----------------------------------------------------

type QuoteExportFields = QuoteFields & {
  id: string;
  forwarder_id: string;
  forwarder_name: string;
  forwarder_status: string | null;
};

function leadTimeText(quote: QuoteExportFields): string | null {
  const { lead_time_min_days: min, lead_time_max_days: max } = quote;
  if (min != null && max != null) return `${min}-${max}`;
  const only = min ?? max;
  return only != null ? String(only) : null;
}

function rankLabelText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.rankPosition === NOT_COMPARABLE) return "Not Comparable";
  if (isExcludedFromRanking(result.quote)) return "Excluded from ranking";
  return result.rankPosition;
}

function vsBaselineText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.vsBaseline === NOT_COMPARABLE) return "Not Comparable";
  if (result.vsBaseline == null || typeof result.costDifference !== "number") return null;
  const pct =
    typeof result.savingPct === "number" ? ` (${(result.savingPct * 100).toFixed(1)}%)` : "";
  return `${result.vsBaseline} ${formatCurrency(result.costDifference, "USD")}${pct}`;
}

function annualSavingsText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.annualCostDifference === NOT_COMPARABLE) return "Not Comparable";
  if (typeof result.annualCostDifference !== "number") return null;
  return formatCurrency(result.annualCostDifference, "USD");
}

function quoteColumns(): Column<ForwarderQuoteResult<QuoteExportFields>>[] {
  return [
    { header: "Scenario Group", tier: "client", value: (r) => r.quote.scenario_group },
    { header: "Forwarder Name", tier: "client", value: (r) => r.quote.forwarder_name },
    {
      header: "Incoterm / Mode / Type",
      tier: "client",
      value: (r) =>
        [r.quote.incoterm, r.quote.shipment_mode, r.quote.shipment_type].filter(Boolean).join(" / ") ||
        null,
    },
    {
      header: "Freight Cost (USD)",
      tier: "client",
      value: (r) => (r.freightCostUsd != null ? formatCurrency(r.freightCostUsd, "USD") : null),
    },
    {
      header: "Cost / kg (USD)",
      tier: "client",
      value: (r) => (r.costPerKg != null ? formatCurrency(r.costPerKg, "USD") : null),
    },
    { header: "Rank", tier: "client", value: rankLabelText },
    { header: "vs Baseline", tier: "client", value: vsBaselineText },
    { header: "Annual Savings", tier: "client", value: annualSavingsText },
    { header: "Lead Time (days)", tier: "client", value: (r) => leadTimeText(r.quote) },
    { header: "Quote Completeness", tier: "client", value: (r) => r.quote.quote_completeness },
    // Only version where an excluded-status forwarder's quote appears at all
    // — without this, that row just says "Excluded from ranking" with no
    // visible reason why.
    { header: "Forwarder Status", tier: "expert", value: (r) => r.quote.forwarder_status ?? null },
    { header: "Key Strength", tier: "expert", value: (r) => r.quote.key_strength },
    { header: "Key Weakness / Risk", tier: "expert", value: (r) => r.quote.key_weakness_risk },
    { header: "Important Assumption", tier: "expert", value: (r) => r.quote.important_assumption },
    { header: "Overall Assessment", tier: "expert", value: (r) => r.quote.overall_assessment },
    { header: "Client Decision", tier: "expert", value: (r) => r.quote.client_decision },
    { header: "Notes", tier: "expert", value: (r) => r.quote.notes },
  ];
}

export async function exportQuotesCsv(
  projectId: string,
  version: ExportVersion,
): Promise<ExportCsvState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const supabase = await createClient();
  const [{ data: project }, { data: quoteRows, error }] = await Promise.all([
    supabase
      .from("forwarder_projects")
      .select(`clients(name), ${FORWARDER_PROJECT_FIELDS_SELECT}`)
      .eq("id", projectId)
      .single(),
    supabase
      .from("forwarder_quotes")
      .select(`id, forwarder_id, ${QUOTE_FIELDS_SELECT}, forwarders!inner(company_name, status, forwarder_project_id)`)
      .eq("forwarders.forwarder_project_id", projectId),
  ]);

  if (error || !project) {
    console.error("exportQuotesCsv fetch error:", error);
    return { error: UNEXPECTED };
  }

  const client = embeddedOne(
    (project as unknown as { clients: unknown }).clients as { name: string } | null,
  );
  const projectTerms = project as unknown as ForwarderProjectTerms;

  type QuoteQueryRow = QuoteFields & {
    id: string;
    forwarder_id: string;
    forwarders:
      | { company_name: string; status: string }
      | { company_name: string; status: string }[]
      | null;
  };
  const quotes: QuoteExportFields[] = ((quoteRows ?? []) as unknown as QuoteQueryRow[])
    .map((q): QuoteExportFields | null => {
      const { forwarders, ...quoteFields } = q;
      const forwarder = embeddedOne(forwarders);
      if (!forwarder) return null;
      return {
        ...quoteFields,
        forwarder_name: forwarder.company_name,
        forwarder_status: forwarder.status,
      };
    })
    .filter((q): q is QuoteExportFields => q !== null);

  const { results } = buildForwarderCostComparison(projectTerms, quotes);
  const filteredResults =
    version === "client" ? results.filter((r) => !isExcludedFromRanking(r.quote)) : results;

  const csv = buildSectionCsv(quoteColumns(), version, filteredResults);
  return { csv, filename: `${sanitizeFilename(client?.name ?? "project")}-quote-comparison-${version}.csv` };
}
