import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTariffPermissions } from "@/lib/auth/get-tariff-permissions";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { todayUtc } from "@/lib/fx/server-rates";
import { LEGAL_STATUS_LABELS, inForceOn } from "@/lib/tariff/additional-duties";
import { formatHtsCode } from "@/lib/tariff/hts-code";
import { compactSourceLabel } from "@/lib/tariff/source-label";
import { indicativeComparison, loadProgramDetail, loadProgramsOverview } from "@/lib/tariff/server-duty-admin";
import { WARNING_BOX_CLASS } from "../../estimate-result";
import { ActionForm } from "../action-form";
import { markProgramReviewed } from "../actions";
import { ReviewStatusBadge } from "../review-status-badge";
import { AddDutyForm, DutyRowEditor } from "./duty-forms";

const sectionClass = "rounded-2xl border border-neutral-border bg-white p-6 shadow-sm";
// The Rows table is wide, so its cells use slightly less side padding.
const thClass = "px-3 py-3 font-medium";
const fieldClass =
  "w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";

// A short rate on one line, with any qualifier on a second, muted line, so
// the column stays narrow.
function rateParts(r: { rate_type: string; rate_pct: number | null; chapter99_heading_at_minimum: string | null }): {
  rate: string;
  qualifier: string | null;
  // False for rows that are only named, never added to a total.
  counted?: boolean;
} {
  if (r.rate_type === "exempt") return { rate: "Exempt", qualifier: null };
  if (r.rate_type === "unconfirmed") {
    return {
      rate: "Unconfirmed",
      qualifier: r.rate_pct != null ? `${r.rate_pct}% as published` : null,
      counted: false,
    };
  }
  if (r.rate_type === "minimum_total") {
    return { rate: `Minimum total ${r.rate_pct}%`, qualifier: `else ${r.chapter99_heading_at_minimum}` };
  }
  return { rate: `+${r.rate_pct}%`, qualifier: null };
}

// Same palette as the review and forwarder status badges
// (docs/DESIGN_SYSTEM.md): in force = green, under litigation = amber,
// enjoined = orange, expired = neutral.
const LEGAL_STATUS_BADGE: Record<string, string> = {
  in_force: "bg-[#DCFCE7] text-[#15803D]",
  in_force_under_litigation: "bg-[#FFF8E1] text-[#B8860B]",
  enjoined: "bg-[#FFE8CC] text-[#B15400]",
  expired: "bg-[#F1F2F4] text-[#6B7280]",
};

// Up to four codes on one line; longer lists show three and a count (the
// full list is the cell's title).
function originsText(origins: string[] | null) {
  if (!origins) return "Any origin";
  return origins.length > 4 ? `${origins.slice(0, 3).join(", ")} +${origins.length - 3}` : origins.join(", ");
}

// One additional-duty program: review it, end-date or edit its rows, add
// rows, and see its history. Tariff editors and admins only.
export default async function ProgramDutyDataPage({ params }: { params: Promise<{ programKey: string }> }) {
  const { programKey } = await params;
  if (!/^[a-z0-9_]+$/.test(programKey)) notFound();
  const { canEditTariffData } = await getTariffPermissions();
  if (!canEditTariffData) notFound();

  const supabase = await createClient();
  const [detail, { overviews }] = await Promise.all([
    loadProgramDetail(supabase, programKey),
    loadProgramsOverview(supabase),
  ]);
  if (!detail) notFound();
  const overview = overviews.find((o) => o.program.key === programKey)!;
  const today = todayUtc();
  const comparison = indicativeComparison(detail.program, detail.rows, today);
  const mismatches = comparison.filter((c) => !c.matches);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 max-sm:px-4">
      <Link
        href="/tariff-calculator/duty-data"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Duty data
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">{detail.program.name}</h1>
        <ReviewStatusBadge status={overview.status} />
      </div>
      <p className="mb-6 text-sm text-neutral-muted">
        {overview.reviewedAt
          ? `Last reviewed ${formatRateDate(overview.reviewedAt.slice(0, 10))}${overview.reviewedByName ? ` by ${overview.reviewedByName}` : ""}.`
          : "Never reviewed."}{" "}
        {overview.status === "pending_review" && "Changes since the last review aren't counted in estimates until it's reviewed again."}
      </p>

      {(overview.staleReason || overview.changesSinceReview.length > 0) && (
        <div className={`${WARNING_BOX_CLASS} mb-6`} role="note">
          {overview.staleReason && <p className="font-semibold">Review may be out of date: {overview.staleReason}.</p>}
          {overview.changesSinceReview.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {overview.changesSinceReview.slice(0, 20).map((c) => (
                <li key={`${c.release_name}-${c.hts_code}`}>
                  {formatHtsCode(c.hts_code)} {c.change} in {c.release_name}
                  {c.change === "changed" && c.old_rate !== c.new_rate && `: ${c.old_rate ?? "—"} → ${c.new_rate ?? "—"}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {overview.status !== "not_loaded" && (
          <section className={sectionClass}>
            <h2 className="mb-1 font-display text-lg font-semibold text-move-navy">Mark reviewed</h2>
            <p className="mb-4 text-sm text-neutral-muted">
              Confirm every row in force matches its primary source. This changes no rates; it records you and the
              date on every estimate that uses this program.
            </p>
            <ActionForm action={markProgramReviewed} submitLabel="Mark reviewed" resetOnSuccess>
              <input type="hidden" name="program_key" value={programKey} />
              <label htmlFor="note" className="text-sm font-medium text-move-navy">
                Note <span className="font-normal text-neutral-muted">(optional)</span>
              </label>
              <textarea id="note" name="note" rows={2} maxLength={1000} className={fieldClass} placeholder="e.g. Checked against FR 2026-15181 and HTS Rev. 20" />
            </ActionForm>
          </section>
        )}

        {comparison.length > 0 && (
          <section className={sectionClass}>
            <h2 className="mb-1 font-display text-lg font-semibold text-move-navy">Indicative rates (from the HTS, not reviewed)</h2>
            <p className="mb-3 text-sm text-neutral-muted">
              Read from the HTS headings when the program was set up and only used as a hint while it has no rows.
              {mismatches.length === 0
                ? " Every one matches a flat row in force."
                : ` ${mismatches.length} don't match a flat row in force: check them before reviewing.`}
            </p>
            {mismatches.length > 0 && (
              <ul className="text-sm text-[#92400E]">
                {mismatches.map((m) => (
                  <li key={m.origin}>
                    {m.origin}: indicative {m.indicative}%, row {m.row == null ? "none" : `${m.row}%`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <section className={`${sectionClass} mt-6`}>
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Rows</h2>
        {detail.rows.length === 0 ? (
          <p className="text-sm text-neutral-muted">No rows yet. Until there are, estimates show this program&apos;s warning.</p>
        ) : (
          // relative: keeps the sr-only text in cells from escaping the scroll
          // box and widening the page.
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm text-move-navy">
              <thead>
                <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Heading</th>
                  <th scope="col" className={`${thClass} w-56 min-w-56`}>For</th>
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Rate</th>
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Origins</th>
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Effective</th>
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Legal status</th>
                  <th scope="col" className={`${thClass} w-full min-w-[280px]`}>Source</th>
                  <th scope="col" className={thClass}><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((r) => {
                  const muted = inForceOn(r, today) ? "" : "text-neutral-muted";
                  const { rate, qualifier, counted } = rateParts(r);
                  const compactSource = compactSourceLabel(r.source_label);
                  return (
                    <Fragment key={r.id}>
                      <tr className={`align-top ${r.notes ? "" : "border-b border-neutral-border"} ${muted}`}>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums">{r.chapter99_heading}</td>
                        <td className="w-56 min-w-56 px-3 py-3">
                          {r.label}
                          {r.hts_scope === "listed" && (
                            <p className="text-xs text-neutral-muted">
                              {r.scopeCount.toLocaleString("en-US")} HTS lines
                              {r.excludedCount > 0 && `, except ${r.excludedCount} statistical number${r.excludedCount === 1 ? "" : "s"}`}
                            </p>
                          )}
                          {r.condition_text && (
                            <p className="text-xs text-neutral-muted">
                              {r.rate_type === "unconfirmed" ? "Open: " : "If "}
                              {r.condition_text}
                              {r.rate_type !== "unconfirmed" &&
                                (r.assume_condition
                                  ? " — treated as met"
                                  : r.rate_type === "exempt"
                                    ? " — not assumed: only named, the duty applies"
                                    : " — not assumed: only named, the higher rate applies")}
                            </p>
                          )}
                          {r.exclusion_heading && (
                            <p className="text-xs text-neutral-muted">
                              Not when {r.excludes_programs.length} other program(s) apply ({r.exclusion_heading})
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {rate}
                          {qualifier && <p className="text-xs text-neutral-muted">{qualifier}</p>}
                          {counted === false && <p className="text-xs text-neutral-muted">never counted</p>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" title={r.origin_countries?.join(", ")}>
                          <span aria-hidden={r.origin_countries ? true : undefined}>{originsText(r.origin_countries)}</span>
                          {r.origin_countries && <span className="sr-only">{r.origin_countries.join(", ")}</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatRateDate(r.effective_from)}
                          {r.effective_to && <span className="block text-xs text-neutral-muted">to {formatRateDate(r.effective_to)}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${LEGAL_STATUS_BADGE[r.legal_status] ?? LEGAL_STATUS_BADGE.expired}`}
                          >
                            {LEGAL_STATUS_LABELS[r.legal_status]}
                          </span>
                        </td>
                        {/* max-w-0 lets the cell take the remaining width while the
                            link truncates instead of widening the table. */}
                        <td className="w-full max-w-0 min-w-[280px] px-3 py-3">
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={r.source_label}
                            aria-label={`${r.source_label} (opens in a new tab)`}
                            className="block truncate underline decoration-neutral-border underline-offset-2 hover:decoration-move-green focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
                          >
                            {compactSource}
                          </a>
                          <p className="text-xs whitespace-nowrap text-neutral-muted">
                            Checked {formatRateDate(r.source_checked_on)}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <DutyRowEditor row={r} />
                        </td>
                      </tr>
                      {r.notes && (
                        <tr className={`border-b border-neutral-border ${muted}`}>
                          <td colSpan={8} className="px-3 pt-0 pb-3 text-xs text-neutral-muted">
                            {/* On a phone the table scrolls sideways; the note stays
                                in view and wraps to the visible width. */}
                            <p className="sticky left-3 max-w-[calc(100vw-6rem)] sm:max-w-none">
                              <span className="font-medium">Note</span>
                              <span className="sr-only"> on {r.chapter99_heading}</span>: {r.notes}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${sectionClass} mt-6`}>
        <details>
          <summary className="cursor-pointer font-display text-lg font-semibold text-move-navy outline-none focus-visible:ring-2 focus-visible:ring-move-green">
            Add a row
          </summary>
          <p className="mt-2 mb-4 text-sm text-neutral-muted">
            Use the primary source (Federal Register, CSMS, HTS U.S. notes) and link it. To replace a rate, end-date the
            current row first and start the new one the next day.
          </p>
          <AddDutyForm programKey={programKey} today={today} />
        </details>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={sectionClass}>
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">Reviews</h2>
          {detail.reviews.length === 0 ? (
            <p className="text-sm text-neutral-muted">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {detail.reviews.map((r) => (
                <li key={r.id}>
                  {formatRateDate(r.reviewed_at.slice(0, 10))} by {r.reviewedByName ?? "unknown"}
                  {r.hts_release_name && <span className="text-neutral-muted"> · HTS {r.hts_release_name}</span>}
                  {r.note && <p className="text-xs text-neutral-muted">{r.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={sectionClass}>
          <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">History</h2>
          {detail.history.length === 0 ? (
            <p className="text-sm text-neutral-muted">No changes recorded.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto text-xs">
              {detail.history.map((h) => (
                <li key={h.id} className="border-b border-neutral-border pb-1.5 last:border-0">
                  <span className="text-neutral-muted">
                    {formatRateDate(h.changed_at.slice(0, 10))} · {h.changedByName ?? "migration"}:
                  </span>{" "}
                  <span className="break-words">{h.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
