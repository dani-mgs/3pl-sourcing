"use server";

import { z } from "zod";
import { sanitizeFilename } from "@/lib/forwarder/export-csv";
import {
  buildForwarderReport,
  buildForwarderReportCsv,
  fetchForwarderReportData,
  type ExportVersion,
} from "@/lib/forwarder/report-data";
import { renderForwarderReportPdf } from "@/lib/forwarder/render-report-pdf";
import { renderForwarderReportDocx } from "@/lib/forwarder/render-report-docx";

// Reads are open to every authenticated user project-wide (PROJECT_STATE.md
// §8) — the Project Summary page itself has no read-side ownership gate, only
// writes do, so these exports don't check getOwnershipContext/canWrite
// either. Anyone who can already see this data in the UI can already read
// every field going into these exports; this is a read-only export of it,
// not a new capability.

export type { ExportVersion };
export type ExportCsvState = { csv: string; filename: string } | { error: string };
export type ExportBinaryState = { base64: string; filename: string } | { error: string };

const uuid = z.string().uuid();

const UNEXPECTED = "An unexpected error occurred.";

export async function exportForwarderReportCsv(
  projectId: string,
  version: ExportVersion,
): Promise<ExportCsvState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const result = await fetchForwarderReportData(projectId);
  if ("error" in result) return { error: result.error };
  const { data } = result;

  return {
    csv: buildForwarderReportCsv(data, version),
    filename: `${sanitizeFilename(data.clientName)}-forwarder-sourcing-${version}.csv`,
  };
}

export async function exportForwarderReportPdf(
  projectId: string,
  version: ExportVersion,
): Promise<ExportBinaryState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const result = await fetchForwarderReportData(projectId);
  if ("error" in result) return { error: result.error };

  const report = buildForwarderReport(result.data, version);
  const buffer = await renderForwarderReportPdf(report);

  return {
    base64: buffer.toString("base64"),
    filename: `${sanitizeFilename(result.data.clientName)}-forwarder-sourcing-${version}.pdf`,
  };
}

export async function exportForwarderReportDocx(
  projectId: string,
  version: ExportVersion,
): Promise<ExportBinaryState> {
  if (!uuid.safeParse(projectId).success) return { error: UNEXPECTED };

  const result = await fetchForwarderReportData(projectId);
  if ("error" in result) return { error: result.error };

  const report = buildForwarderReport(result.data, version);
  const buffer = await renderForwarderReportDocx(report);

  return {
    base64: buffer.toString("base64"),
    filename: `${sanitizeFilename(result.data.clientName)}-forwarder-sourcing-${version}.docx`,
  };
}
