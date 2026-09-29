"use server";

import { z } from "zod";
import { buildCsv, buildMultiSectionCsv, sanitizeFilename } from "@/lib/forwarder/export-csv";
import {
  buildSectionTable,
  fetchForwarderReportData,
  filterQuotesForVersion,
  forwarderColumns,
  projectColumns,
  quoteColumns,
  type ExportVersion,
} from "@/lib/forwarder/report-data";

// Reads are open to every authenticated user project-wide (PROJECT_STATE.md
// §8) — the Project Summary page itself has no read-side ownership gate, only
// writes do, so this export doesn't check getOwnershipContext/canWrite
// either. Anyone who can already see this data in the UI can already read
// every field going into it; this is a read-only export of it, not a new
// capability.

export type { ExportVersion };
export type ExportCsvState = { csv: string; filename: string } | { error: string };

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

  const quoteResults = filterQuotesForVersion(data.quoteResults, version);
  const projectTable = buildSectionTable(projectColumns(), version, [data.projectRow]);
  const forwarderTable = buildSectionTable(forwarderColumns(), version, data.forwarders);
  const quoteTable = buildSectionTable(quoteColumns(), version, quoteResults);

  const csv = buildMultiSectionCsv([
    { title: "PROJECT DETAILS", csv: buildCsv(projectTable.headers, projectTable.rows) },
    { title: "FORWARDERS", csv: buildCsv(forwarderTable.headers, forwarderTable.rows) },
    { title: "QUOTE COMPARISON", csv: buildCsv(quoteTable.headers, quoteTable.rows) },
  ]);

  return { csv, filename: `${sanitizeFilename(data.clientName)}-forwarder-sourcing-${version}.csv` };
}
