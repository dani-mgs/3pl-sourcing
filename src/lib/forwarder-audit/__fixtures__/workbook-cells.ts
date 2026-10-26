import { cat, eq, type Cell } from "../calc-semantics";
import { text } from "../cargo";
import type { AuditResult } from "../engine";
import { summaryQuestion, summarySheet } from "../summary-sheet";
import type { AuditInputs, FindingRow } from "../types";

// Test-only: lays an engine result out as the workbook's formula cells
// ("Audit!C3" -> value), so the golden test can compare every one.

const COL = (n: number) => String.fromCharCode(65 + n);

export function workbookCells(inputs: AuditInputs, r: AuditResult): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const put = (sheet: string, cell: string, v: Cell) => out.set(`${sheet}!${cell}`, v);
  const f = r.figures;

  // Checks: lines (rows 2-51, B-Z).
  r.lines.forEach((l, i) => {
    const row = i + 2;
    const values: Cell[] = [
      l.name, l.category, l.service, l.group, l.status, l.basisCode, l.rate, l.currency, l.fx, l.quantity,
      l.preTax, l.inclTax, l.total, l.priced, l.forwarderTotal, l.check, l.difference, l.agreedExcess, l.flag,
      l.duplicate, l.inScope, l.unpriced, l.questionKind, l.taxRate, l.firmPreTax,
    ];
    values.forEach((v, c) => put("Checks", `${COL(c + 1)}${row}`, v));
  });
  // Checks: coverage (rows 55-61, B-N).
  r.coverage.forEach((c, s) => {
    const values: Cell[] = [
      c.requested, c.pricedLines, c.unpricedLines, c.includedLines, c.excludedLines, c.notApplicableLines,
      c.found, c.mark, c.coverage, c.firmAmount, c.payer, c.firmLines, c.mismatchParty,
    ];
    values.forEach((v, k) => put("Checks", `${COL(k + 1)}${55 + s}`, v));
  });
  // Checks: findings (rows 70-319, B-K).
  for (const x of r.findings) {
    const values: Cell[] = [x.active, x.type, x.order, x.charge, x.issue, x.explanation, x.action, x.amount, x.rank, x.questionRank];
    values.forEach((v, k) => put("Checks", `${COL(k + 1)}${x.row}`, v));
  }
  // Checks: figures (AF2-AF34) and the rankings.
  const af: Record<number, Cell> = {
    2: f.status, 3: f.errors, 4: f.questions, 5: f.risks, 6: f.insufficient, 7: f.linesEntered, 8: f.pricedLines,
    9: f.fxMissing, 10: f.knownFirm, 11: f.estimates, 12: f.estimateLines, 13: f.conditional, 14: f.conditionalUnpriced,
    15: f.unpricedCount, 16: f.confirmedDiscrepancies, 17: f.underQuestion, 18: f.servicesNotAllIn, 19: f.allIn,
    20: f.firmLabel, 21: f.statusSentence, 22: f.firmNote, 23: f.verificationText, 24: f.notChecked, 25: f.verifiedLines,
    26: f.calculatedOnlyLines, 27: f.errorLines, 28: f.firmPreTax, 29: f.knownFirm, 30: r.measures.revenueTonnes,
    31: r.measures.chargeableKg, 32: r.measures.divisorUsed, 33: r.measures.cbm, 34: f.notStarted,
  };
  for (const [row, v] of Object.entries(af)) put("Checks", `AF${row}`, v);
  for (let k = 0; k < 30; k++) {
    const x = r.shown[k];
    put("Checks", `AI${k + 2}`, x ? x.rank : "");
    put("Checks", `AJ${k + 2}`, x ? x.row - 69 : "");
  }
  for (let k = 0; k < 15; k++) {
    const x = r.questions[k];
    put("Checks", `AM${k + 2}`, x ? x.row : "");
    put("Checks", `AN${k + 2}`, x ? x.row - 69 : "");
  }

  auditSheet(inputs, r, put);
  summaryCells(inputs, r, put);
  return out;
}

type Put = (sheet: string, cell: string, v: Cell) => void;

function auditSheet(inputs: AuditInputs, r: AuditResult, put: Put) {
  const f = r.figures;
  const a = (cell: string, v: Cell) => put("Audit", cell, v);
  a("C3", f.status);
  a("G3", f.firmLabel);
  a("J3", f.knownFirm);
  a("L3", `${f.errors} errors · ${f.questions} questions · ${f.risks} risks  —  see section 5`);
  const rows = [r.cargo.pieces, r.cargo.packages, r.cargo.grossWeight, r.cargo.volume];
  rows.forEach((row, k) => {
    a(`C${35 + k}`, row.ciPl);
    if (k !== 1) {
      a(`E${35 + k}`, row.difference);
      a(`F${35 + k}`, row.differencePercent);
    }
    a(`H${35 + k}`, row.check);
  });
  a("C39", r.measures.revenueTonnes);
  a("J39", r.measures.chargeableKg);
  a("L39", eq(text(inputs.quotation.mode), "Air") ? `Divisor used: ${cat(r.measures.divisorUsed)}` : "");
  r.coverage.forEach((c, s) => {
    a(`D${43 + s}`, c.found);
    a(`H${43 + s}`, c.coverage);
    a(`J${43 + s}`, c.firmAmount);
    a(`M${43 + s}`, c.payer);
  });
  r.lines.forEach((l, i) => {
    a(`H${54 + i}`, l.quantity);
    a(`P${54 + i}`, l.total);
    a(`Q${54 + i}`, l.check);
    a(`R${54 + i}`, l.group);
  });
  a("B104", f.firmLabel);
  a("P104", f.knownFirm);
  a("C108", f.status);
  a("G108", f.statusSentence);
  a("B109", f.firmLabel);
  a("C109", f.knownFirm);
  a("D109", f.firmNote);
  a("C110", f.estimates);
  a("D110", `Lines marked Estimate: ${f.estimateLines}`);
  a("C111", f.conditional);
  a("D111", `Priced if-required lines; plus ${f.conditionalUnpriced} if-required item(s) with no amount`);
  a("C112", f.unpricedCount);
  a("D112", "Number of lines charged at cost or still to be confirmed");
  a("C113", f.confirmedDiscrepancies);
  a("D113", "Confirmed calculation, agreed-rate or document errors. + = quoted above the correct amount");
  a("C114", f.underQuestion);
  a("D114", "Charges attached to open questions; may or may not be removed");
  a("C115", f.verificationText);
  a("C116", f.notChecked);
  for (let k = 0; k < 30; k++) {
    const x: FindingRow | undefined = r.shown[k];
    const row = 119 + k;
    a(`A${row}`, x ? k + 1 : "");
    a(`B${row}`, x ? x.type : "");
    a(`C${row}`, x ? x.charge : "");
    a(`E${row}`, x ? x.issue : "");
    a(`H${row}`, x ? x.explanation : "");
    a(`N${row}`, x ? x.action : "");
    a(`Q${row}`, x ? x.amount : "");
  }
}

function summaryCells(inputs: AuditInputs, r: AuditResult, put: Put) {
  const f = r.figures;
  const t = summarySheet(inputs, f);
  const s = (cell: string, v: Cell) => put("Summary", cell, v);
  s("E1", t.preparedFor);
  s("E2", t.byLine);
  s("E3", t.reference);
  s("C5", f.status);
  s("E5", f.statusSentence);
  s("C8", t.forwarder);
  s("E8", t.validity);
  s("C9", t.service);
  s("E9", t.route);
  s("C10", t.shipment);
  s("E10", t.cargo);
  s("A13", f.firmLabel);
  s("D13", f.knownFirm);
  s("E13", f.firmNote);
  s("D14", f.estimates);
  s("D15", f.conditional);
  s("E15", `Plus ${f.conditionalUnpriced} if-required item(s) with no amount`);
  s("D16", f.unpricedCount);
  s("D17", f.confirmedDiscrepancies);
  s("D18", f.underQuestion);
  r.coverage.forEach((c, k) => {
    s(`A${22 + k}`, c.service);
    s(`C${22 + k}`, c.requested === "" ? "-" : c.requested);
    s(`D${22 + k}`, c.coverage);
    s(`E${22 + k}`, c.payer === "" ? "-" : c.payer);
    s(`F${22 + k}`, c.firmAmount);
  });
  for (let k = 0; k < 30; k++) {
    const x = r.shown[k];
    const row = 32 + k;
    s(`A${row}`, x ? k + 1 : "");
    s(`B${row}`, x ? x.type : "");
    s(`C${row}`, x ? x.charge : "");
    s(`D${row}`, x ? x.issue : "");
    s(`E${row}`, x ? x.action : "");
    s(`F${row}`, x ? x.amount : "");
  }
  for (let k = 0; k < 15; k++) {
    const x = r.questions[k];
    s(`A${64 + k}`, x ? `${k + 1}.` : "");
    s(`B${64 + k}`, x ? summaryQuestion(x) : "");
  }
  s("A81", t.checked);
  s("A82", t.notChecked);
  s("A83", t.lineVerification);
}
