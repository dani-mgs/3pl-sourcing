import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { countryName } from "@/lib/tariff/countries";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { excludedCount } from "@/lib/tariff/programs";

// The latest saved (locked) estimates on the calculator page, as listed
// columns of duty_estimates. warnings is the stored snapshot, read as is.
export type SavedEstimateListRow = {
  id: string;
  created_at: string;
  created_by: string;
  label: string | null;
  hts_code: string;
  origin_country: string;
  total_usd: number | string;
  warnings: unknown;
};

export function SavedEstimatesTable({
  estimates,
  authors,
}: {
  estimates: SavedEstimateListRow[];
  authors: Map<string, string>;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Saved estimates</h2>
      {estimates.length === 0 ? (
        <p className="text-sm text-neutral-muted">No saved estimates yet. Calculate one, then Save estimate.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="px-4 py-3 font-medium">Saved</th>
                <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                <th scope="col" className="px-4 py-3 font-medium">HTS code</th>
                <th scope="col" className="px-4 py-3 font-medium">Origin</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total (USD)</th>
                <th scope="col" className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr key={e.id} className="border-b border-neutral-border last:border-0 hover:bg-neutral-bg">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/tariff-calculator/estimates/${e.id}`}
                      className="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
                    >
                      {formatRateDate((e.created_at as string).slice(0, 10))}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{e.label ?? <span className="text-neutral-muted">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatHtsCode(e.hts_code as string)}</td>
                  <td className="px-4 py-3">{countryName(e.origin_country as string)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular-nums">{formatCurrency(Number(e.total_usd), "USD")}</span>
                    {excludedCount(e.warnings) > 0 && (
                      // Same rule as the estimate itself: a total that leaves
                      // programs out never reads as complete.
                      <span className="block text-xs font-medium text-[#92400E]">
                        Excludes {excludedCount(e.warnings)} additional duty program
                        {excludedCount(e.warnings) === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{authors.get(e.created_by as string) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
