"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type Format = "CSV" | "PDF" | "DOCX";

const FORMATS: Format[] = ["CSV", "PDF", "DOCX"];
const VERSIONS: { version: ExportVersion; label: string }[] = [
  { version: "client", label: "Client version" },
  { version: "expert", label: "Expert version" },
];

// One menu for all six exports (Client/Expert × CSV/PDF/DOCX). Available to
// anyone who can view the project; the server actions do their own checks.
export function ExportMenu({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runExport(version: ExportVersion, format: Format) {
    setError(null);
    startTransition(async () => {
      if (format === "CSV") {
        setError(downloadCsv(await exportForwarderReportCsv(projectId, version)));
      } else if (format === "PDF") {
        setError(downloadBinary(await exportForwarderReportPdf(projectId, version), PDF_MIME));
      } else {
        setError(downloadBinary(await exportForwarderReportDocx(projectId, version), DOCX_MIME));
      }
    });
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" disabled={isPending} />}
        >
          <Download className="size-3.5" />
          {isPending ? "Exporting..." : "Export"}
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {VERSIONS.map(({ version, label }, index) => (
            <DropdownMenuGroup key={version}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              {FORMATS.map((format) => (
                <DropdownMenuItem key={format} onClick={() => runExport(version, format)}>
                  {version === "client" ? "Client" : "Expert"} {format}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-72 rounded-xl border border-danger/30 bg-white px-3 py-2 text-sm text-danger shadow-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
