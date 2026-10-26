import { cargoBasis, cargoMeasures, type CargoBasis, type CargoMeasures } from "./cargo";
import { calculateCoverage } from "./coverage";
import { lineFindings, serviceFindings } from "./findings-lines";
import { shipmentFindings } from "./findings-shipment";
import { calculateLines } from "./lines";
import { V1_SETTINGS, type AuditSettings } from "./lists";
import { auditFigures, lineFigures, rankFindings, type AuditFigures } from "./summary";
import type { AuditInputs, CoverageResult, FindingRow, LineResult } from "./types";

// The Forwarder Audit engine: a pure port of the frozen v1.0 workbook
// (docs/forwarder-audit/Forwarder_Audit_Template_v1.0.xlsx). Inputs in,
// everything the Audit and Summary sheets show out; nothing is stored.
// Matched cell by cell against LibreOffice recalculations of the workbook
// (forwarder-audit.golden.test.ts), workbook quirks included (TECH_DEBT).

export type AuditResult = {
  settings: AuditSettings;
  measures: CargoMeasures;
  cargo: CargoBasis;
  lines: LineResult[]; // all 50 slots
  coverage: CoverageResult[]; // 7 services
  findings: FindingRow[]; // all 250 rows, in sheet order
  figures: AuditFigures;
  shown: FindingRow[]; // top 30, most important first
  questions: FindingRow[]; // the Summary's top 15 questions, in sheet order
};

export function runAudit(inputs: AuditInputs, settings: AuditSettings = V1_SETTINGS): AuditResult {
  const measures = cargoMeasures(inputs, settings);
  const cargo = cargoBasis(inputs);
  const lines = calculateLines(inputs, measures, settings);
  const coverage = calculateCoverage(inputs, lines);
  const lf = lineFigures(inputs, lines);
  const findings = [
    ...shipmentFindings({ inputs, cargo, coverage, f: lf, s: settings }),
    ...serviceFindings(inputs, coverage),
    ...lineFindings(inputs, lines),
  ];
  const figures = auditFigures(inputs, { ...lf, rows: lines }, coverage, findings);
  return { settings, measures, cargo, lines, coverage, findings, figures, ...rankFindings(findings) };
}
