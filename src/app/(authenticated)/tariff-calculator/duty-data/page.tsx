import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { loadProgramsOverview } from "@/lib/tariff/server-duty-admin";
import { WARNING_BOX_CLASS } from "../estimate-result";
import { ReviewStatusBadge } from "./review-status-badge";

const linkClass =
  "rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none";

// Duty data overview for tariff editors and admins: each additional-duty
// program's review state, and chapter 99 changes since its last review.
export default async function DutyDataPage() {
  const { canEditTariffData } = await getTariffPermissions();
  if (!canEditTariffData) notFound();

  const supabase = await createClient();
  const { overviews, recentChanges } = await loadProgramsOverview(supabase);
  const flagged = overviews.filter((o) => o.staleReason);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 max-sm:px-4">
      <Link
        href="/tariff-calculator"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tariff Calculator
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">Duty data</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-muted">
            Only reviewed programs count toward estimate totals. Any change to a program&apos;s rows puts it back to
            pending review. To change a rate, end-date the row and add a new one.
          </p>
        </div>
        <Link href="/tariff-calculator/duty-data/fees" className={`${linkClass} text-sm`}>
          Customs fees →
        </Link>
      </div>

      {flagged.length > 0 && (
        <div className={`${WARNING_BOX_CLASS} mb-6`} role="note">
          <p className="font-semibold">Reviews that may be out of date</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {flagged.map((o) => (
              <li key={o.program.key}>
                {o.program.name}: {o.staleReason}.
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Programs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="px-4 py-3 font-medium">Program</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Rows in force</th>
                <th scope="col" className="px-4 py-3 font-medium">Last reviewed</th>
                <th scope="col" className="px-4 py-3 font-medium">Chapter 99 changes since</th>
              </tr>
            </thead>
            <tbody>
              {overviews.map((o) => (
                <tr key={o.program.key} className="border-b border-neutral-border last:border-0 hover:bg-neutral-bg">
                  <td className="px-4 py-3">
                    <Link href={`/tariff-calculator/duty-data/${o.program.key}`} className={linkClass}>
                      {o.program.name}
                    </Link>
                    {o.program.status === "inactive" && <span className="ml-2 text-xs text-neutral-muted">inactive</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ReviewStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.rowsInForce}</td>
                  <td className="px-4 py-3">
                    {o.reviewedAt ? (
                      <>
                        {formatRateDate(o.reviewedAt.slice(0, 10))}
                        {o.reviewedByName && <span className="text-neutral-muted"> by {o.reviewedByName}</span>}
                      </>
                    ) : (
                      <span className="text-neutral-muted">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.changesSinceReview.length > 0 ? (
                      <span className="font-medium text-[#92400E]">{o.changesSinceReview.length}</span>
                    ) : (
                      <span className="text-neutral-muted">{o.reviewedAt ? "None" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-display text-lg font-semibold text-move-navy">Recent Chapter 99 changes</h2>
        <p className="mb-4 text-sm text-neutral-muted">
          Headings added, removed or changed when a new HTS release was imported. They count against a program&apos;s
          review when they&apos;re in the same group (e.g. 9903.05) as its headings.
        </p>
        {recentChanges.length === 0 ? (
          <p className="text-sm text-neutral-muted">No changes recorded yet (they&apos;re recorded from the next HTS release on).</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {recentChanges.map((c) => (
              <li key={`${c.release_name}-${c.hts_code}`} className="border-b border-neutral-border pb-2 last:border-0">
                <span className="font-medium tabular-nums">{formatHtsCode(c.hts_code)}</span>{" "}
                <span className="text-neutral-muted">
                  {c.change} in {c.release_name} ({formatRateDate(c.detected_at.slice(0, 10))})
                </span>
                {c.change === "changed" && c.old_rate !== c.new_rate && (
                  <p className="text-xs text-neutral-muted">
                    Rate: {c.old_rate ?? "—"} → {c.new_rate ?? "—"}
                  </p>
                )}
                {c.change !== "removed" && c.new_description && (
                  <p className="line-clamp-2 text-xs text-neutral-muted" title={c.new_description}>
                    {c.new_description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
