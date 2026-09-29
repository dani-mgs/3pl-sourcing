"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  exportForwarderReportCsv,
  exportForwarderReportDocx,
  exportForwarderReportPdf,
  type ExportBinaryState,
  type ExportCsvState,
  type ExportVersion,
} from "./export-actions";

function downloadCsv(state: ExportCsvState): string | null {
  if ("error" in state) return state.error;
  const blob = new Blob(["﻿" + state.csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.filename;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

function downloadBinary(state: ExportBinaryState, mimeType: string): string | null {
  if ("error" in state) return state.error;
  const binary = atob(state.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.filename;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function ExportBar({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function runExport<T>(
    label: string,
    action: (projectId: string, version: ExportVersion) => Promise<T>,
    version: ExportVersion,
    download: (state: T) => string | null,
  ) {
    setError(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result = await action(projectId, version);
      setError(download(result));
      setPendingLabel(null);
    });
  }

  const groups: {
    label: string;
    buttons: { label: string; version: ExportVersion; onClick: () => void }[];
  }[] = [
    {
      label: "CSV",
      buttons: [
        {
          label: "Client CSV",
          version: "client",
          onClick: () =>
            runExport("Client CSV", exportForwarderReportCsv, "client", downloadCsv),
        },
        {
          label: "Expert CSV",
          version: "expert",
          onClick: () =>
            runExport("Expert CSV", exportForwarderReportCsv, "expert", downloadCsv),
        },
      ],
    },
    {
      label: "PDF",
      buttons: [
        {
          label: "Client PDF",
          version: "client",
          onClick: () =>
            runExport("Client PDF", exportForwarderReportPdf, "client", (s: ExportBinaryState) =>
              downloadBinary(s, PDF_MIME),
            ),
        },
        {
          label: "Expert PDF",
          version: "expert",
          onClick: () =>
            runExport("Expert PDF", exportForwarderReportPdf, "expert", (s: ExportBinaryState) =>
              downloadBinary(s, PDF_MIME),
            ),
        },
      ],
    },
    {
      label: "DOCX",
      buttons: [
        {
          label: "Client DOCX",
          version: "client",
          onClick: () =>
            runExport("Client DOCX", exportForwarderReportDocx, "client", (s: ExportBinaryState) =>
              downloadBinary(s, DOCX_MIME),
            ),
        },
        {
          label: "Expert DOCX",
          version: "expert",
          onClick: () =>
            runExport("Expert DOCX", exportForwarderReportDocx, "expert", (s: ExportBinaryState) =>
              downloadBinary(s, DOCX_MIME),
            ),
        },
      ],
    },
  ];

  return (
    <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {groups.map((group) => (
          <div key={group.label} className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-muted">{group.label}:</span>
            {group.buttons.map((button) => (
              <Button
                key={button.label}
                variant="outline"
                className="px-3 py-1.5 text-sm"
                disabled={isPending}
                onClick={button.onClick}
              >
                {pendingLabel === button.label ? "Exporting..." : button.label}
              </Button>
            ))}
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
