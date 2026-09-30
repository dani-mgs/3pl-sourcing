import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnershipContext } from "@/lib/auth/get-ownership-context";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { embeddedOne } from "@/lib/clients";
import {
  NOT_COMPARABLE,
  RANKING_EXCLUDED_STATUSES,
} from "@/lib/forwarder/cost-comparison";
import type {
  ForwarderAssessment,
  ForwarderStatus,
} from "@/lib/forwarder/forwarder-fields";
import {
  loadProjectComparison,
  type ComparisonResult,
} from "@/lib/forwarder/load-project-comparison";
import {
  FORWARDER_FIELDS_SELECT,
  type ForwarderFields,
} from "@/lib/forwarder/parse-forwarder-form";
import { shortRouteLabel } from "@/lib/forwarder/project-display";
import {
  costBarScale,
  lowestFreightQuote,
  pickBestQuotes,
  quotePosition,
} from "@/lib/forwarder/project-summary";
import { requirementFit, type FitProject } from "@/lib/forwarder/requirement-fit";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  ForwarderAssessmentBadge,
  ForwarderStatusBadge,
} from "../../forwarder-status-badge";
import { ForwarderOverflowMenu } from "./forwarder-overflow-menu";
import { ForwarderNotes, ForwarderProfile } from "./forwarder-profile";
import {
  ForwarderSummaryTiles,
  type ForwarderSummary,
} from "./forwarder-summary-tiles";
import { AddQuoteButton, QuotesTable, type QuoteTableRow } from "./quotes-table";
import { RequirementFitCard } from "./requirement-fit-card";

function rankOrder(r: ComparisonResult): number {
  return typeof r.costRank === "number" ? r.costRank : Infinity;
}

// Why none of this forwarder's quotes is ranked, for the summary tiles.
function unrankedReason(
  own: ComparisonResult[],
  excluded: boolean,
  finalTermsSet: boolean,
): string {
  if (own.length === 0) return "No quotes yet";
  if (excluded) return "Excluded from ranking";
  if (!finalTermsSet) return "Set final terms to rank quotes";
  if (own.some((r) => r.costRank === NOT_COMPARABLE)) return "Not comparable — terms differ";
  return "No priced quote yet";
}

export default async function ForwarderDetailPage({
  params,
}: PageProps<"/forwarder-sourcing/[id]/forwarders/[forwarderId]">) {
  const { id, forwarderId } = await params;
  const supabase = await createClient();

  // Every quote in the project is loaded and ranked together; this page then
  // picks out its own forwarder's rows (see load-project-comparison.ts).
  const [comparison, { data: forwarder }, { canWrite }] = await Promise.all([
    loadProjectComparison(supabase, id, forwarderId),
    supabase
      .from("forwarders")
      .select(`id, updated_at, ${FORWARDER_FIELDS_SELECT}`)
      .eq("id", forwarderId)
      .eq("forwarder_project_id", id)
      .single(),
    getOwnershipContext(id, "forwarder_projects"),
  ]);

  if (!comparison || !forwarder) {
    notFound();
  }
  // The select string above is built at runtime, so Supabase can't infer its
  // columns from the literal type; the Zod-derived type is the real contract
  // here (see FORWARDER_FIELDS_SELECT).
  const fields = forwarder as unknown as ForwarderFields & {
    id: string;
    updated_at: string;
  };

  const { project, results, effectiveAnnualShipments, details } = comparison;
  const client = embeddedOne(project.clients as { name: string } | null);
  const clientName = client?.name ?? "—";
  const route = shortRouteLabel(project);
  const baseline = project.current_freight_cost_usd as number | null;
  const targetLeadTime = project.target_lead_time_days as number | null;
  const finalTermsSet =
    project.final_incoterm != null &&
    project.final_shipment_mode != null &&
    project.final_shipment_type != null;
  const excluded = RANKING_EXCLUDED_STATUSES.includes(fields.status);
  // Server date (UTC on Vercel) for rate-expiry flags.
  const today = new Date().toISOString().slice(0, 10);

  const own = results.filter((r) => r.quote.forwarder_id === forwarderId);
  const ownBest = pickBestQuotes(own);
  const headline = ownBest.best[0] ?? lowestFreightQuote(own);
  const ranked = ownBest.best.length > 0;
  const position = ranked && headline ? quotePosition(results, headline) : null;
  const summary: ForwarderSummary = {
    headline,
    ranked,
    unrankedReason: ranked ? null : unrankedReason(own, excluded, finalTermsSet),
    rankedGroupCount: ownBest.rankedGroupCount,
    position: position && {
      rank: position.rank,
      of: position.rankedInGroup,
      tiedWith: [...new Set(position.tiedWith.map((r) => r.quote.forwarder_name))],
    },
  };

  const projectBestIds = new Set(pickBestQuotes(results).best.map((r) => r.quote.id));
  const rows: QuoteTableRow[] = [...own]
    .sort(
      (a, b) =>
        a.quote.scenario_group.localeCompare(b.quote.scenario_group) ||
        rankOrder(a) - rankOrder(b) ||
        (a.freightCostUsd ?? Infinity) - (b.freightCostUsd ?? Infinity),
    )
    .map((result) => {
      const { updated_at, ...text } = details.get(result.quote.id)!;
      const rowPosition = quotePosition(results, result);
      return {
        result,
        details: { ...text, updatedRelative: formatRelativeTime(updated_at) },
        // Same scale as the Project Summary: the group's quotes across every
        // forwarder, so bar lengths match between the two pages.
        scale: costBarScale(
          results
            .filter((r) => r.quote.scenario_group === result.quote.scenario_group)
            .map((r) => r.freightCostUsd),
          baseline,
        ),
        position: rowPosition && {
          rank: rowPosition.rank,
          of: rowPosition.rankedInGroup,
          tied: rowPosition.tiedWith.length > 0,
        },
        isProjectBest: projectBestIds.has(result.quote.id),
      };
    });

  const fit = requirementFit(project as unknown as FitProject, fields);

  return (
    <div className="mx-auto max-w-[1680px] px-8 py-6">
      <nav aria-label="Breadcrumb" className="mb-1 text-xs break-words text-neutral-muted">
        <Link href="/forwarder-sourcing" className="hover:underline">
          Forwarder Sourcing
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/forwarder-sourcing/${id}`} className="hover:underline">
          {clientName}
          {route && <> · {route}</>}
        </Link>
        <span className="mx-1.5">/</span>
        <span aria-current="page">{fields.company_name}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-semibold break-words text-move-navy">
              {fields.company_name}
            </h1>
            <ForwarderStatusBadge status={fields.status as ForwarderStatus} />
            {fields.assessment && (
              <ForwarderAssessmentBadge assessment={fields.assessment as ForwarderAssessment} />
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-muted">
            Last updated {new Date(fields.updated_at).toLocaleDateString()}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/forwarder-sourcing/${id}/forwarders/${forwarderId}/edit`} />}
            >
              Edit
            </Button>
            <ForwarderOverflowMenu
              projectId={id}
              forwarderId={forwarderId}
              companyName={fields.company_name}
            />
          </div>
        )}
      </div>

      {excluded && (
        <div className="mb-4 rounded-xl bg-[#FFE8CC] px-4 py-3 text-sm font-medium text-[#B15400]">
          Excluded from ranking — status: {fields.status}. Its quotes are shown but not ranked.
        </div>
      )}

      <ViewOnlyBanner
        clientRequirementId={id}
        canWrite={canWrite}
        table="forwarder_projects"
      />

      <ForwarderSummaryTiles
        summary={summary}
        baseline={baseline}
        effectiveAnnualShipments={effectiveAnnualShipments}
        targetLeadTime={targetLeadTime}
        today={today}
        fit={fit}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            title="Quotes"
            action={canWrite && <AddQuoteButton projectId={id} forwarderId={forwarderId} />}
          >
            <QuotesTable
              projectId={id}
              forwarderId={forwarderId}
              rows={rows}
              baseline={baseline}
              targetLeadTime={targetLeadTime}
              today={today}
              canWrite={canWrite}
            />
          </SectionCard>
          <RequirementFitCard fit={fit} />
        </div>

        <aside className="flex flex-col gap-6 self-start xl:sticky xl:top-24 xl:max-h-[calc(100svh-7rem)] xl:overflow-y-auto">
          <ForwarderNotes fields={fields} />
          <ForwarderProfile fields={fields} />
        </aside>
      </div>
    </div>
  );
}
