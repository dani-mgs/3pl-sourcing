import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import {
  buildCostComparison,
  type CostComparisonRow,
  type CostInputs,
} from "@/lib/cost-comparison";

const EXCLUDED_STATUSES = new Set([
  "Unfit",
  "Do not Contact",
  "Withdrawn / No Response",
]);

export type PanelProvider = CostInputs & {
  id: string;
  company_name: string;
  status: string;
  is_incumbent: boolean;
};

const noteClass =
  "mb-3 rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]";

function SavingsLine({ row }: { row: CostComparisonRow<PanelProvider> }) {
  if (row.savingsState === "baseline") {
    return (
      <span className="rounded-full bg-[#E3F2FD] px-1.5 py-0.5 text-[11px] font-medium text-[#1565C0]">
        Baseline
      </span>
    );
  }
  if (row.savingsState !== "value" || row.savings_vs_baseline == null) {
    return null;
  }
  const diff = row.savings_vs_baseline;
  const color =
    diff > 0 ? "text-move-green" : diff < 0 ? "text-danger" : "text-neutral-muted";
  const pct = row.savings_pct != null ? ` (${row.savings_pct.toFixed(1)}%)` : "";
  const label = diff > 0 ? "saves" : diff < 0 ? "above baseline" : "matches baseline";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {formatCurrency(diff, row.provider.currency)}
      {pct} <span className="font-normal">{label}</span>
    </span>
  );
}

export function CostComparisonPanel({
  projectId,
  providers,
}: {
  projectId: string;
  providers: PanelProvider[];
}) {
  const included = providers.filter(
    (p) => p.is_incumbent || !EXCLUDED_STATUSES.has(p.status),
  );
  const { rows, baselineStatus, mixedCurrencies, distinctCurrencies } =
    buildCostComparison(included);

  const costed = rows.filter((r) => r.has_cost_data);
  const uncosted = rows.filter((r) => !r.has_cost_data);
  const ordered = [
    ...(mixedCurrencies
      ? [...costed].sort(
          (a, b) => Number(b.provider.is_incumbent) - Number(a.provider.is_incumbent),
        )
      : [...costed].sort((a, b) => a.cost_rank! - b.cost_rank!)),
    ...uncosted,
  ];

  return (
    <section
      aria-labelledby="cost-comparison-heading"
      className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm"
    >
      <h2
        id="cost-comparison-heading"
        className="font-display text-lg font-semibold text-move-navy"
      >
        Cost Comparison
      </h2>
      <p className="mb-4 text-xs text-neutral-muted">
        {mixedCurrencies
          ? "Total cost per 3PL, in each 3PL's own currency"
          : baselineStatus === "Ready"
            ? "Ranked by total cost, lowest first · savings vs baseline"
            : "Ranked by total cost, lowest first"}
      </p>

      {costed.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-muted">
          No cost data yet.
        </p>
      ) : (
        <>
          {baselineStatus === "Pending" && (
            <p className={noteClass}>
              The incumbent 3PL has no cost data yet — savings will appear
              once its costs are entered.
            </p>
          )}
          {mixedCurrencies && (
            <p className={noteClass}>
              3PLs are quoted in different currencies (
              {distinctCurrencies.join(" and ")}) — ranking and savings are
              hidden until all quotes use the same currency.
            </p>
          )}

          <ol className="-mx-2 min-[640px]:max-[1479px]:columns-2 min-[640px]:max-[1479px]:gap-x-8">
            {ordered.map((row) => (
              <li key={row.provider.id} className="break-inside-avoid">
                <Link
                  href={`/3pl-sourcing/projects/${projectId}/providers/${row.provider.id}`}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
                >
                  <span
                    className={
                      "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                      (row.cost_rank != null
                        ? "bg-move-navy text-white"
                        : "bg-neutral-bg text-neutral-muted")
                    }
                    aria-label={row.cost_rank != null ? `Rank ${row.cost_rank}` : "Unranked"}
                  >
                    {row.cost_rank ?? "–"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium break-words text-move-navy">
                        {row.provider.company_name}
                      </span>
                      {row.total_cost != null && (
                        <span className="shrink-0 text-sm text-move-navy tabular-nums">
                          {formatCurrency(row.total_cost, row.provider.currency)}
                        </span>
                      )}
                    </span>
                    {!row.has_cost_data && (
                      <span className="text-xs text-neutral-muted">
                        Not enough data to rank
                      </span>
                    )}
                    {(row.provider.is_incumbent || row.savingsState === "value") && (
                      <span className="flex justify-between">
                        {row.provider.is_incumbent && row.savingsState !== "baseline" ? (
                          <span className="rounded-full bg-[#E3F2FD] px-1.5 py-0.5 text-[11px] font-medium text-[#1565C0]">
                            Baseline
                          </span>
                        ) : (
                          <SavingsLine row={row} />
                        )}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
