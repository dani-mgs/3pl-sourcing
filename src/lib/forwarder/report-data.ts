import { createClient } from "@/lib/supabase/server";
import { embeddedOne } from "@/lib/clients";
import { formatCurrency } from "@/lib/currency";
import { FORWARDER_PROJECT_FIELDS_SELECT } from "./parse-project-form";
import { PROJECT_SECTIONS } from "./project-sections";
import { formatProjectValue, routeLabel } from "./project-display";
import { CAPABILITY_FIELDS } from "./forwarder-fields";
import { FORWARDER_FIELDS_SELECT, type ForwarderFields } from "./parse-forwarder-form";
import { QUOTE_FIELDS_SELECT, type QuoteFields } from "./parse-quote-form";
import {
  NOT_COMPARABLE,
  buildForwarderCostComparison,
  isExcludedFromRanking,
  type ForwarderProjectTerms,
  type ForwarderQuoteResult,
} from "./cost-comparison";

// Shared by CSV, PDF, and DOCX export (export-actions.ts, render-report-pdf.ts,
// render-report-docx.ts) — the tier-based (client/expert) column definitions,
// the excluded-status-quote filtering, and the Supabase fetch/cost-comparison
// build all live here exactly once, so client/expert correctness is defined
// in one place regardless of which output format consumes it.
//
// Not a "use server" file: these are plain fetch/pure helpers invoked from
// within Server Actions, not Server Actions themselves.

export type ExportVersion = "client" | "expert";

export type CellValue = string | number | null;

export type Column<T> = {
  header: string;
  tier: "client" | "expert";
  value: (row: T) => CellValue;
};

export function buildSectionTable<T>(
  columns: Column<T>[],
  version: ExportVersion,
  rows: T[],
): { headers: string[]; rows: CellValue[][] } {
  const cols = version === "expert" ? columns : columns.filter((c) => c.tier === "client");
  return {
    headers: cols.map((c) => c.header),
    rows: rows.map((row) => cols.map((c) => c.value(row))),
  };
}

// formatProjectValue returns "—" for an empty field on the page; a report
// should just leave it blank/omitted instead.
function blankDash(text: string): string | null {
  return text === "—" ? null : text;
}

// ---- Project Details ------------------------------------------------------

export type ProjectExportRow = Record<string, unknown> & {
  clientName: string | null;
  businessModel: string | null;
  status: string;
};

export function projectColumns(): Column<ProjectExportRow>[] {
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

// ---- Forwarders -------------------------------------------------------------

export function forwarderColumns(): Column<ForwarderFields>[] {
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

// ---- Quote Comparison -------------------------------------------------------

export type QuoteExportFields = QuoteFields & {
  id: string;
  forwarder_id: string;
  forwarder_name: string;
  forwarder_status: string | null;
};

export function leadTimeText(quote: QuoteExportFields): string | null {
  const { lead_time_min_days: min, lead_time_max_days: max } = quote;
  if (min != null && max != null) return `${min}-${max}`;
  const only = min ?? max;
  return only != null ? String(only) : null;
}

export function rankLabelText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.rankPosition === NOT_COMPARABLE) return "Not Comparable";
  if (isExcludedFromRanking(result.quote)) return "Excluded from ranking";
  return result.rankPosition;
}

export function vsBaselineText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.vsBaseline === NOT_COMPARABLE) return "Not Comparable";
  if (result.vsBaseline == null || typeof result.costDifference !== "number") return null;
  const pct =
    typeof result.savingPct === "number" ? ` (${(result.savingPct * 100).toFixed(1)}%)` : "";
  return `${result.vsBaseline} ${formatCurrency(result.costDifference, "USD")}${pct}`;
}

export function annualSavingsText(result: ForwarderQuoteResult<QuoteExportFields>): string | null {
  if (result.annualCostDifference === NOT_COMPARABLE) return "Not Comparable";
  if (typeof result.annualCostDifference !== "number") return null;
  return formatCurrency(result.annualCostDifference, "USD");
}

export function quoteColumns(): Column<ForwarderQuoteResult<QuoteExportFields>>[] {
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

export function filterQuotesForVersion(
  results: ForwarderQuoteResult<QuoteExportFields>[],
  version: ExportVersion,
): ForwarderQuoteResult<QuoteExportFields>[] {
  return version === "client" ? results.filter((r) => !isExcludedFromRanking(r.quote)) : results;
}

// ---- Fetch ------------------------------------------------------------------

export type ForwarderReportData = {
  clientName: string;
  route: string | null;
  projectRow: ProjectExportRow;
  forwarders: ForwarderFields[];
  // Full expert set, unfiltered — callers apply filterQuotesForVersion.
  quoteResults: ForwarderQuoteResult<QuoteExportFields>[];
};

export async function fetchForwarderReportData(
  projectId: string,
): Promise<{ data: ForwarderReportData } | { error: string }> {
  const supabase = await createClient();

  const [{ data: project, error: projectError }, { data: forwarderRows, error: forwarderError }, { data: quoteRows, error: quoteError }] =
    await Promise.all([
      supabase
        .from("forwarder_projects")
        .select(`id, status, clients(name, business_model), ${FORWARDER_PROJECT_FIELDS_SELECT}`)
        .eq("id", projectId)
        .single(),
      supabase
        .from("forwarders")
        .select(FORWARDER_FIELDS_SELECT)
        .eq("forwarder_project_id", projectId)
        .order("company_name", { ascending: true }),
      supabase
        .from("forwarder_quotes")
        .select(`id, forwarder_id, ${QUOTE_FIELDS_SELECT}, forwarders!inner(company_name, status, forwarder_project_id)`)
        .eq("forwarders.forwarder_project_id", projectId),
    ]);

  if (projectError || !project || forwarderError || quoteError) {
    console.error("fetchForwarderReportData fetch error:", projectError ?? forwarderError ?? quoteError);
    return { error: "An unexpected error occurred." };
  }

  const row = project as unknown as Record<string, unknown> & { status: string; clients: unknown };
  const client = embeddedOne(
    row.clients as { name: string; business_model: string | null } | null,
  );
  const projectRow: ProjectExportRow = {
    ...row,
    clientName: client?.name ?? null,
    businessModel: client?.business_model ?? null,
    status: row.status,
  };

  const projectTerms = row as unknown as ForwarderProjectTerms;

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

  return {
    data: {
      clientName: client?.name ?? "project",
      route: routeLabel(row),
      projectRow,
      forwarders: (forwarderRows ?? []) as unknown as ForwarderFields[],
      quoteResults: results,
    },
  };
}

// ---- Combined report (PDF/DOCX) ---------------------------------------------

export type ReportSection =
  | { title: string; kind: "keyvalue"; pairs: { label: string; value: CellValue }[] }
  | { title: string; kind: "table"; headers: string[]; rows: CellValue[][] };

export type ForwarderReport = {
  clientName: string;
  route: string | null;
  versionLabel: "Client Report" | "Expert Report";
  generatedOn: string;
  sections: ReportSection[];
};

export function buildForwarderReport(
  data: ForwarderReportData,
  version: ExportVersion,
): ForwarderReport {
  const quoteResults = filterQuotesForVersion(data.quoteResults, version);

  const projectTable = buildSectionTable(projectColumns(), version, [data.projectRow]);
  const projectPairs = projectTable.headers
    .map((label, i) => ({ label, value: projectTable.rows[0][i] }))
    .filter((p) => p.value != null && p.value !== "");

  const forwarderTable = buildSectionTable(forwarderColumns(), version, data.forwarders);
  const quoteTable = buildSectionTable(quoteColumns(), version, quoteResults);

  return {
    clientName: data.clientName,
    route: data.route,
    versionLabel: version === "client" ? "Client Report" : "Expert Report",
    generatedOn: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    sections: [
      { title: "Project Summary", kind: "keyvalue", pairs: projectPairs },
      { title: "Forwarders Considered", kind: "table", headers: forwarderTable.headers, rows: forwarderTable.rows },
      { title: "Quote Comparison", kind: "table", headers: quoteTable.headers, rows: quoteTable.rows },
    ],
  };
}
