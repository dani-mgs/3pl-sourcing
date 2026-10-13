import Link from "next/link";
import type { ReportChoice } from "@/lib/client-updates/load-market-reports";
import { LocalDate } from "./local-date";
import { MarketReportView } from "./market-report";
import { MarketReportPlaceholder, ViewSwitch } from "./portal-home";

// /portal/market-report and its "View as client" twin. The caller has already
// chosen what to show (chooseReport); "not_found" is handled by the page.

export function MarketReportPageBody({
  choice,
  summaryHref,
  reportHref,
}: {
  choice: Exclude<ReportChoice, { kind: "not_found" }>;
  summaryHref: string;
  reportHref: string;
}) {
  if (choice.kind === "locked") return <MarketReportPlaceholder tier="free" summaryHref={summaryHref} reportHref={reportHref} />;
  if (choice.kind === "preparing") {
    return <MarketReportPlaceholder tier="market_report" summaryHref={summaryHref} reportHref={reportHref} />;
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ViewSwitch current="report" summaryHref={summaryHref} reportHref={reportHref} tier="market_report" />
      <h1 className="font-display text-3xl font-extrabold text-move-navy">Market Report</h1>
      {choice.kind === "list" ? (
        <section aria-labelledby="reports" className="rounded-2xl border border-neutral-border bg-white p-5">
          <h2 id="reports" className="font-display text-base font-bold text-portal-ink">Your Market Reports</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {choice.entries.map((e) => (
              <li key={e.key}>
                <Link href={`${reportHref}?p=${e.key}`} className="font-semibold text-move-navy underline">
                  Freight forwarder project{e.payload?.project.route ? ` · ${e.payload.project.route}` : ""}
                </Link>{" "}
                <span className="text-sm text-portal-muted">
                  · <LocalDate timestamp={e.publishedAt} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : choice.entry.payload ? (
        <MarketReportView payload={choice.entry.payload} publishedAt={choice.entry.publishedAt} />
      ) : (
        <p className="rounded-2xl border border-neutral-border bg-white p-6 text-portal-ink">
          This report can&apos;t be shown. Ask your Move contact for a copy.
        </p>
      )}
    </div>
  );
}
