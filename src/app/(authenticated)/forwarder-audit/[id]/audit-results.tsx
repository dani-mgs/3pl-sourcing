import { cat } from "@/lib/forwarder-audit/calc-semantics";
import type { AuditResult } from "@/lib/forwarder-audit/engine";
import { textMoney } from "@/lib/forwarder-audit/text-format";
import { STATUS_CLASS, TYPE_CLASS, cardClass, hintClass, sectionTitleClass } from "../styles";

// Section 5: the audit's results, calculated from the inputs on this page
// (display only; nothing shown here is ever stored).

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 align-top";

export function AuditResults({ result, currency }: { result: AuditResult; currency: string }) {
  const f = result.figures;
  const rows: [string, number | string, string][] = [
    [f.firmLabel, textMoney(f.knownFirm), f.firmNote],
    ["Estimates (not in firm figure)", textMoney(f.estimates), `Lines marked Estimate: ${f.estimateLines}`],
    ["Conditional (only if they occur)", textMoney(f.conditional), `Priced if-required lines; plus ${f.conditionalUnpriced} if-required item(s) with no amount`],
    ["Unpriced items (at cost / TBC)", String(f.unpricedCount), "Number of lines charged at cost or still to be confirmed"],
    ["Confirmed discrepancies (net)", textMoney(f.confirmedDiscrepancies), "Confirmed calculation, agreed-rate or document errors. + = quoted above the correct amount"],
    ["Under question - NOT a saving", textMoney(f.underQuestion), "Charges attached to open questions; may or may not be removed"],
  ];
  return (
    <section className={cardClass} aria-labelledby="fa-results-title">
      <h2 id="fa-results-title" className={sectionTitleClass}>
        5 Audit results
      </h2>
      <p className={`${hintClass} mt-1 mb-4`}>Automatic. Amounts are in the quotation currency{currency ? ` (${currency})` : ""}. Nothing here is saved; it is recalculated from the inputs.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3" role="status">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_CLASS[f.status] ?? "bg-neutral-bg"}`}>{f.status}</span>
        <span className="text-sm text-move-navy">{f.statusSentence}</span>
      </div>
      <p className="mb-4 text-sm text-neutral-muted">
        {f.errors} errors · {f.questions} questions · {f.risks} risks
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-move-navy">
          <tbody>
            {rows.map(([label, value, note]) => (
              <tr key={label} className="border-b border-neutral-border last:border-0">
                <th scope="row" className={`${td} font-medium`}>
                  {label}
                </th>
                <td className={`${td} text-right tabular-nums`}>{value}</td>
                <td className={`${td} text-neutral-muted`}>{note}</td>
              </tr>
            ))}
            <tr className="border-b border-neutral-border">
              <th scope="row" className={`${td} font-medium`}>
                Line verification
              </th>
              <td className={td} colSpan={2}>
                {f.verificationText}
              </td>
            </tr>
            <tr>
              <th scope="row" className={`${td} font-medium`}>
                Checks not performed
              </th>
              <td className={td} colSpan={2}>
                {f.notChecked}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-move-navy">Findings (most important first)</h3>
      {result.shown.length === 0 ? (
        <p className="text-sm text-neutral-muted">No findings.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-move-navy">
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className={th}>#</th>
                <th scope="col" className={th}>Type</th>
                <th scope="col" className={th}>Charge</th>
                <th scope="col" className={th}>Issue</th>
                <th scope="col" className={th}>Explanation</th>
                <th scope="col" className={th}>Recommended correction or question</th>
                <th scope="col" className={`${th} text-right`}>Amount at stake</th>
              </tr>
            </thead>
            <tbody>
              {result.shown.map((x, i) => (
                <tr key={x.key} className="border-b border-neutral-border last:border-0">
                  <td className={`${td} tabular-nums`}>{i + 1}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[x.type]}`}>{x.type}</span>
                  </td>
                  <td className={td}>{cat(x.charge)}</td>
                  <td className={td}>{cat(x.issue)}</td>
                  <td className={td}>{cat(x.explanation)}</td>
                  <td className={td}>{cat(x.action)}</td>
                  <td className={`${td} text-right tabular-nums`}>{x.amount === "" ? "" : textMoney(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`${hintClass} mt-3`}>Up to 30 findings are shown.</p>
    </section>
  );
}
