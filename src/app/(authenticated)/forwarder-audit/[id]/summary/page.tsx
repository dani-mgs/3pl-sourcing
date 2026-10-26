import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cat } from "@/lib/forwarder-audit/calc-semantics";
import { runAudit } from "@/lib/forwarder-audit/engine";
import { isForwarderAuditEnabled } from "@/lib/forwarder-audit/feature-flag";
import { loadAudit } from "@/lib/forwarder-audit/server-audit";
import { summaryQuestion, summarySheet } from "@/lib/forwarder-audit/summary-sheet";
import { textMoney } from "@/lib/forwarder-audit/text-format";
import { STATUS_CLASS, TYPE_CLASS, cardClass } from "../../styles";
import { PrintButton } from "./print-button";

// The audit's Summary, the workbook's Summary sheet: rendered on the server
// from the last SAVED inputs with the same engine and wording, for the
// browser's print dialog (Print / save as PDF; fits one page wide). Behind
// FORWARDER_AUDIT_ENABLED: off, this page doesn't exist.
export default async function ForwarderAuditSummaryPage({ params }: PageProps<"/forwarder-audit/[id]/summary">) {
  if (!isForwarderAuditEnabled()) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const loaded = await loadAudit(supabase, id);
  if (!loaded.ok && loaded.code === "not_found") notFound();
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-10">
        <p className={`${cardClass} text-sm text-danger`} role="alert">
          {loaded.message}
        </p>
      </div>
    );
  }

  const { inputs } = loaded.audit;
  const result = runAudit(inputs);
  const f = result.figures;
  const t = summarySheet(inputs, f);
  const th = "px-2 py-1.5 text-left text-xs font-medium tracking-wide text-neutral-muted uppercase";
  const td = "px-2 py-1.5 align-top";
  const h2 = "mt-6 mb-2 border-b border-neutral-border pb-1 font-display text-base font-semibold text-move-navy";

  return (
    <div className="mx-auto max-w-4xl px-8 py-6 text-sm text-move-navy max-sm:px-4 print:max-w-none print:px-0 print:py-0 print:text-[11px]">
      {/* One page wide: A4 with modest margins; the app header is hidden when printing. */}
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/forwarder-audit/${id}`} className="inline-flex items-center gap-1.5 font-medium text-move-green hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to the audit
        </Link>
        <PrintButton />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-move-navy pb-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-move-green">MOVE SUPPLY CHAIN</p>
          <h1 className="font-display text-xl font-semibold">Freight Quotation Audit - Summary</h1>
        </div>
        <div className="text-right text-xs">
          <p>{t.preparedFor}</p>
          <p>{t.byLine}</p>
          <p>{t.reference}</p>
        </div>
      </header>

      <section aria-label="Status" className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_CLASS[f.status] ?? "bg-neutral-bg"}`}>{f.status}</span>
        <span>{f.statusSentence}</span>
      </section>

      <h2 className={h2}>Quotation audited</h2>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-neutral-muted">Forwarder</dt>
        <dd>{cat(t.forwarder)}</dd>
        <dt className="text-neutral-muted">Validity</dt>
        <dd>{t.validity}</dd>
        <dt className="text-neutral-muted">Service</dt>
        <dd>{t.service}</dd>
        <dt className="text-neutral-muted">Route</dt>
        <dd>{t.route}</dd>
        <dt className="text-neutral-muted">Shipment</dt>
        <dd>{t.shipment}</dd>
        <dt className="text-neutral-muted">Cargo</dt>
        <dd>{t.cargo}</dd>
      </dl>

      <h2 className={h2}>Cost picture</h2>
      <table className="w-full">
        <tbody>
          {(
            [
              [f.firmLabel, textMoney(f.knownFirm), f.firmNote],
              ["Estimates (not in firm figure)", textMoney(f.estimates), ""],
              ["Conditional charges - only if they occur", textMoney(f.conditional), `Plus ${f.conditionalUnpriced} if-required item(s) with no amount`],
              ["Unpriced items (at cost / TBC)", String(f.unpricedCount), ""],
              ["Confirmed discrepancies (Errors, net)", textMoney(f.confirmedDiscrepancies), ""],
              ["Amount under question - NOT a confirmed saving", textMoney(f.underQuestion), ""],
            ] as const
          ).map(([label, value, note]) => (
            <tr key={label} className="border-b border-neutral-border">
              <th scope="row" className={`${td} text-left font-medium`}>{label}</th>
              <td className={`${td} text-right tabular-nums`}>{value}</td>
              <td className={`${td} text-neutral-muted`}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={h2}>Requested services</h2>
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-border">
            <th className={th}>Service</th>
            <th className={th}>Requested</th>
            <th className={th}>Coverage</th>
            <th className={th}>Normally paid by (Incoterm)</th>
            <th className={`${th} text-right`}>Firm amount</th>
          </tr>
        </thead>
        <tbody>
          {result.coverage.map((c) => (
            <tr key={c.service} className="border-b border-neutral-border">
              <td className={td}>{c.service}</td>
              <td className={td}>{c.requested === "" ? "-" : c.requested}</td>
              <td className={td}>{c.coverage}</td>
              <td className={td}>{c.payer === "" ? "-" : c.payer}</td>
              <td className={`${td} text-right tabular-nums`}>{textMoney(c.firmAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={h2}>Findings and recommended actions</h2>
      {result.shown.length === 0 ? (
        <p className="text-neutral-muted">No findings.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-border">
              <th className={th}>#</th>
              <th className={th}>Type</th>
              <th className={th}>Charge</th>
              <th className={th}>Issue</th>
              <th className={th}>Recommended correction or question</th>
              <th className={`${th} text-right`}>Amount at stake</th>
            </tr>
          </thead>
          <tbody>
            {result.shown.map((x, i) => (
              <tr key={x.key} className="border-b border-neutral-border break-inside-avoid">
                <td className={`${td} tabular-nums`}>{i + 1}</td>
                <td className={td}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[x.type]}`}>{x.type}</span>
                </td>
                <td className={td}>{cat(x.charge)}</td>
                <td className={td}>{cat(x.issue)}</td>
                <td className={td}>{cat(x.action)}</td>
                <td className={`${td} text-right tabular-nums`}>{x.amount === "" ? "" : textMoney(x.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result.questions.length > 0 && (
        <>
          <h2 className={h2}>Questions to send to the forwarder</h2>
          <ol className="list-decimal pl-6">
            {result.questions.map((x) => (
              <li key={x.key} className="break-inside-avoid py-0.5">
                {summaryQuestion(x)}
              </li>
            ))}
          </ol>
        </>
      )}

      <h2 className={h2}>Scope of this audit</h2>
      <p>{t.checked}</p>
      <p className="mt-1">{t.notChecked}</p>
      <p className="mt-1">{t.lineVerification}</p>
    </div>
  );
}
