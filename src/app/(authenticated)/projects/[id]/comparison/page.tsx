import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProviderStatus } from "../providers/status-badge";
import { ComparisonTable, type ComparisonRow } from "./comparison-table";

type ProviderRow = {
  id: string;
  company_name: string;
  location: string | null;
  status: string;
  is_incumbent: boolean;
  b2b: boolean;
  b2c: boolean;
  fulfillment: boolean;
  storage: boolean;
  cross_docking: boolean;
  temp_controlled_storage: boolean;
  storage_cost: number | null;
  pick_pack_cost: number | null;
  receiving_cost: number | null;
  returns_cost: number | null;
};

export type BaselineStatus = "N/A" | "Pending" | "Ready";

function buildComparisonRows(
  providers: ProviderRow[],
  currentIncumbent3pl: string | null,
): { rows: ComparisonRow[]; baselineStatus: BaselineStatus } {
  const withCostFlags = providers.map((p) => {
    const costs = [
      p.storage_cost,
      p.pick_pack_cost,
      p.receiving_cost,
      p.returns_cost,
    ];
    const has_cost_data = costs.some((c) => c != null);
    const total_cost = has_cost_data
      ? costs.reduce((sum: number, c) => sum + (c ?? 0), 0)
      : null;
    return { ...p, has_cost_data, total_cost };
  });

  let baselineStatus: BaselineStatus;
  const incumbentProvider = withCostFlags.find((p) => p.is_incumbent);

  if (!currentIncumbent3pl) {
    baselineStatus = "N/A";
  } else if (incumbentProvider && incumbentProvider.has_cost_data) {
    baselineStatus = "Ready";
  } else {
    baselineStatus = "Pending";
  }

  const baselineTotalCost =
    baselineStatus === "Ready" ? incumbentProvider!.total_cost! : null;

  const rankable = withCostFlags
    .filter((p) => p.has_cost_data)
    .sort((a, b) => a.total_cost! - b.total_cost!);
  const rankById = new Map<string, number>();
  rankable.forEach((p, i) => rankById.set(p.id, i + 1));

  const rows: ComparisonRow[] = withCostFlags.map((p) => {
    const cost_rank = rankById.get(p.id) ?? null;

    let savingsState: ComparisonRow["savingsState"];
    let savings_vs_baseline: number | null = null;
    let savings_pct: number | null = null;
    let cost_position: string;

    if (!p.has_cost_data) {
      savingsState = "no-data";
      cost_position = "Not enough data";
    } else if (baselineStatus === "N/A") {
      savingsState = "na";
      cost_position = "N/A";
    } else if (baselineStatus === "Pending") {
      savingsState = "pending";
      cost_position = "Pending";
    } else if (p.is_incumbent) {
      savingsState = "baseline";
      cost_position = "Baseline";
    } else {
      const diff = baselineTotalCost! - p.total_cost!;
      savingsState = "value";
      savings_vs_baseline = diff;
      savings_pct = baselineTotalCost !== 0 ? (diff / baselineTotalCost!) * 100 : null;
      cost_position =
        diff > 0 ? "Beats Baseline" : diff === 0 ? "Matches Baseline" : "Above Baseline";
    }

    return {
      id: p.id,
      company_name: p.company_name,
      location: p.location,
      status: p.status as ProviderStatus,
      is_incumbent: p.is_incumbent,
      b2b: p.b2b,
      b2c: p.b2c,
      fulfillment: p.fulfillment,
      storage: p.storage,
      cross_docking: p.cross_docking,
      temp_controlled_storage: p.temp_controlled_storage,
      has_cost_data: p.has_cost_data,
      total_cost: p.total_cost,
      cost_rank,
      savingsState,
      savings_vs_baseline,
      savings_pct,
      cost_position,
    };
  });

  return { rows, baselineStatus };
}

export default async function ComparisonPage({
  params,
}: PageProps<"/projects/[id]/comparison">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select("id, current_incumbent_3pl")
    .eq("id", id)
    .single();

  if (!clientRequirement) {
    notFound();
  }

  const { data: providers } = await supabase
    .from("three_pl_providers")
    .select(
      "id, company_name, location, status, is_incumbent, b2b, b2c, fulfillment, storage, cross_docking, temp_controlled_storage, storage_cost, pick_pack_cost, receiving_cost, returns_cost",
    )
    .eq("client_requirement_id", id)
    .order("created_at", { ascending: false });

  const { rows, baselineStatus } = buildComparisonRows(
    (providers ?? []) as ProviderRow[],
    clientRequirement.current_incumbent_3pl,
  );

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to project
      </Link>

      <div className="mt-2 mb-8">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Comparison
        </h1>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No providers yet.{" "}
            <Link
              href={`/projects/${id}/providers`}
              className="font-medium text-move-green hover:underline"
            >
              Add providers first
            </Link>{" "}
            to compare them here.
          </p>
        </div>
      ) : (
        <>
          {baselineStatus === "Pending" && (
            <div className="mb-6 rounded-2xl border border-[#FBBF24] bg-[#FFFBEB] p-4 text-sm text-[#92400E] shadow-sm">
              Incumbent noted (&quot;{clientRequirement.current_incumbent_3pl}
              &quot;) but cost data isn&apos;t complete yet — Savings and Cost
              Position are provisional until entered.
            </div>
          )}

          <ComparisonTable rows={rows} />
        </>
      )}
    </div>
  );
}
