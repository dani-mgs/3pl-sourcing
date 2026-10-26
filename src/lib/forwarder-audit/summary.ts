import { countIfs, eq, sum, sumIfs, type Cell } from "./calc-semantics";
import { text } from "./cargo";
import type { LineFigures } from "./findings-shipment";
import { MAX_FINDINGS_SHOWN, MAX_LINES, MAX_SUMMARY_QUESTIONS } from "./lists";
import type { AuditInputs, CoverageResult, FindingRow, LineResult } from "./types";

// The audit's status and summary figures (Checks AF2-AF29) and the ranked
// findings (AH-AN).

export type AuditStatus =
  | "Not started"
  | "Insufficient Information"
  | "Corrections Required"
  | "Needs Clarification"
  | "Audit Complete — No Issues Identified";

export function lineFigures(inputs: AuditInputs, lines: LineResult[]): LineFigures {
  const name = (j: number): Cell => lines[j].name;
  const status = (j: number): Cell => lines[j].status;
  const linesEntered = countIfs(MAX_LINES, [name, "?*"]);
  return {
    linesEntered,
    pricedLines: sum(lines.map((l) => l.priced)),
    fxMissing: countIfs(MAX_LINES, [(j) => lines[j].check, "Exchange rate missing"]),
    knownFirm: sumIfs(MAX_LINES, (j) => lines[j].total, [status, "Firm"]),
    estimates: sumIfs(MAX_LINES, (j) => lines[j].total, [status, "Estimate"]),
    estimateLines: countIfs(MAX_LINES, [status, "Estimate"]),
    firmPreTax: sum(lines.map((l) => l.firmPreTax)),
    notStarted: inputs.quotation.forwarder === "" && linesEntered === 0 ? 1 : 0,
    fumigationLines: countIfs(MAX_LINES, [name, "*fumig*"]),
    fumigationAmount: sumIfs(MAX_LINES, (j) => lines[j].total, [name, "*fumig*"]),
  };
}

export type AuditFigures = LineFigures & {
  status: AuditStatus; // AF2
  errors: number; // AF3
  questions: number; // AF4
  risks: number; // AF5
  insufficient: 0 | 1; // AF6
  conditional: number; // AF13
  conditionalUnpriced: number; // AF14
  unpricedCount: number; // AF15
  confirmedDiscrepancies: number; // AF16
  underQuestion: number; // AF17 (double counts, TECH_DEBT B1)
  servicesNotAllIn: number; // AF18
  allIn: 0 | 1; // AF19
  firmLabel: string; // AF20
  statusSentence: string; // AF21
  firmNote: string; // AF22
  verificationText: string; // AF23
  notChecked: string; // AF24
  verifiedLines: number; // AF25
  calculatedOnlyLines: number; // AF26
  errorLines: number; // AF27
};

export function auditFigures(inputs: AuditInputs, lines: LineFigures & { rows: LineResult[] }, coverage: CoverageResult[], findings: FindingRow[]): AuditFigures {
  const rows = lines.rows;
  const status = (j: number): Cell => rows[j].status;
  const check = (j: number): Cell => rows[j].check;
  const n = findings.length;
  const typeSum = (type: string, value: (k: number) => Cell) => sumIfs(n, value, [(k) => findings[k].active, 1], [(k) => findings[k].type, type]);
  const activeOf = (type: string) => sumIfs(n, (k) => findings[k].active, [(k) => findings[k].type, type]);
  const errors = activeOf("Error");
  const questions = activeOf("Question");
  const risks = activeOf("Risk");
  const sh = inputs.shipment;
  const insufficient =
    eq(text(sh.commercialInvoiceReceived), "No") || eq(text(sh.packingListReceived), "No") || eq(text(sh.quotationItemised), "No") || (lines.linesEntered > 0 && lines.pricedLines === 0)
      ? 1
      : 0;
  const statusValue: AuditStatus =
    lines.notStarted === 1
      ? "Not started"
      : insufficient === 1
        ? "Insufficient Information"
        : errors > 0
          ? "Corrections Required"
          : questions + risks > 0
            ? "Needs Clarification"
            : "Audit Complete — No Issues Identified";
  const ifRequiredLines = countIfs(MAX_LINES, [status, "If required"]);
  const unpricedCount = sum(rows.map((l) => l.unpriced));
  const req = (k: number): Cell => coverage[k].requested;
  const cov = (k: number): Cell => coverage[k].coverage;
  const servicesNotAllIn =
    countIfs(7, [req, "Yes"], [cov, "Not addressed"]) + countIfs(7, [req, "Yes"], [cov, "Excluded"]) + countIfs(7, [req, "Yes"], [cov, "Unpriced"]);
  const allIn =
    lines.linesEntered > 0 && servicesNotAllIn === 0 && lines.estimateLines === 0 && ifRequiredLines === 0 && unpricedCount === 0 && lines.fxMissing === 0 ? 1 : 0;
  const verifiedLines = countIfs(MAX_LINES, [check, "Verified"]);
  const calculatedOnlyLines = countIfs(MAX_LINES, [check, "Calculated — Not Independently Verified"]);
  const errorLines = countIfs(MAX_LINES, [check, "Error*"]);
  return {
    ...lines,
    status: statusValue,
    errors,
    questions,
    risks,
    insufficient,
    conditional: sumIfs(MAX_LINES, (j) => rows[j].total, [status, "If required"]),
    conditionalUnpriced: countIfs(MAX_LINES, [status, "If required"], [(j) => rows[j].priced, 0]),
    unpricedCount,
    confirmedDiscrepancies: typeSum("Error", (k) => findings[k].amount),
    underQuestion: typeSum("Question", (k) => findings[k].amount),
    servicesNotAllIn,
    allIn,
    firmLabel: (allIn ? "All-In Firm Total (as quoted)" : "Known Firm Charges — Not All-In") + (errors > 0 ? " — Subject to Correction" : ""),
    statusSentence: statusSentence(statusValue, errors, questions, risks),
    firmNote:
      (errors > 0 ? `Subject to correction: ${errors} confirmed error(s) open; this figure is the quotation as submitted, not a corrected amount. ` : "") +
      (allIn
        ? "Every requested service is firmly priced."
        : "Not all-in: " +
          (servicesNotAllIn > 0 ? `${servicesNotAllIn} requested service(s) excluded, unpriced or not addressed; ` : "") +
          (lines.estimateLines > 0 ? "estimates; " : "") +
          (ifRequiredLines > 0 ? "conditional charges; " : "") +
          (unpricedCount > 0 ? "at-cost/TBC items; " : "") +
          (lines.fxMissing > 0 ? "missing exchange rates; " : "")),
    verificationText: `${verifiedLines} verified · ${calculatedOnlyLines} calculated, not independently verified · ${errorLines} with errors`,
    notChecked:
      (eq(text(sh.rateAgreementProvided), "Yes") ? "" : "Agreed rates (no rate agreement provided); ") +
      "market price levels (no benchmark used); duty and tax rates (to be confirmed by a licensed customs broker).",
    verifiedLines,
    calculatedOnlyLines,
    errorLines,
  };
}

function statusSentence(status: AuditStatus, errors: number, questions: number, risks: number): string {
  if (status === "Not started") return "Enter shipment, quotation and charge details to start the audit.";
  if (status === "Insufficient Information")
    return "The quotation cannot be audited properly yet: see the questions about missing documents or breakdown.";
  if (status === "Corrections Required")
    return `${errors} confirmed error(s) must be corrected by the forwarder${questions > 0 ? ` and ${questions} question(s) answered` : ""} before the client proceeds.`;
  if (status === "Needs Clarification") return `No confirmed errors, but ${questions} question(s) and ${risks} risk(s) remain open before the client proceeds.`;
  return "All checks passed on the information provided. No unpriced, estimated or excluded requested costs remain.";
}

// SMALL over rank = type order x 1000 + sheet row: unique, so no ties.
export function rankFindings(findings: FindingRow[]): { shown: FindingRow[]; questions: FindingRow[] } {
  const active = findings.filter((f) => f.active === 1);
  const shown = [...active].sort((a, b) => (a.rank as number) - (b.rank as number)).slice(0, MAX_FINDINGS_SHOWN);
  const questions = active
    .filter((f) => f.type === "Question")
    .sort((a, b) => a.row - b.row)
    .slice(0, MAX_SUMMARY_QUESTIONS);
  return { shown, questions };
}
