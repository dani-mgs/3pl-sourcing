"use client";

import { useState, useTransition } from "react";
import { Download, FileText } from "lucide-react";
import { exportVersionCsvAction, exportVersionPdfAction } from "../actions";
import { errorTextClass, linkButtonClass, secondaryButtonClass } from "../styles";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function useVersionExport(snapshotId: string) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"pdf" | "csv" | null>(null);
  const [, startTransition] = useTransition();

  function run(kind: "pdf" | "csv") {
    setError(null);
    setPending(kind);
    startTransition(async () => {
      try {
        if (kind === "pdf") {
          const result = await exportVersionPdfAction({ snapshotId });
          if (!result.ok) return setError(result.error);
          const binary = atob(result.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          save(new Blob([bytes], { type: "application/pdf" }), result.filename);
        } else {
          const result = await exportVersionCsvAction({ snapshotId });
          if (!result.ok) return setError(result.error);
          // A BOM so Excel reads it as UTF-8.
          save(new Blob(["﻿" + result.csv], { type: "text/csv;charset=utf-8;" }), result.filename);
        }
      } finally {
        setPending(null);
      }
    });
  }
  return { error, pending, run };
}

const ErrorText = ({ error }: { error: string | null }) =>
  error ? (
    <p className={errorTextClass} role="alert">
      {error}
    </p>
  ) : null;

// The version page: "Download PDF" and "Export CSV", for every staff viewer.
// Both are built on the server from the stored version only.
export function VersionExportButtons({ snapshotId }: { snapshotId: string }) {
  const { error, pending, run } = useVersionExport(snapshotId);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} disabled={pending != null} onClick={() => run("pdf")}>
          <FileText aria-hidden="true" className="size-4" /> {pending === "pdf" ? "Preparing PDF…" : "Download PDF"}
        </button>
        <button type="button" className={secondaryButtonClass} disabled={pending != null} onClick={() => run("csv")}>
          <Download aria-hidden="true" className="size-4" /> {pending === "csv" ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

// The versions list: a PDF link per version.
export function VersionPdfLink({ snapshotId, versionNo }: { snapshotId: string; versionNo: number }) {
  const { error, pending, run } = useVersionExport(snapshotId);
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" className={`${linkButtonClass} text-xs`} disabled={pending != null} onClick={() => run("pdf")}>
        {pending ? "Preparing…" : "PDF"}
        <span className="sr-only"> of v{versionNo}</span>
      </button>
      <ErrorText error={error} />
    </span>
  );
}
