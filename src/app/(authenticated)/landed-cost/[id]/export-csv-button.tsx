"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportWorkspaceCsvAction } from "../actions";
import { errorTextClass, hintClass, secondaryButtonClass } from "../styles";

// "Export CSV", for every staff viewer: built on the server from the last
// save, with a fresh calculation.
export function ExportCsvButton({ workspaceId, dirty }: { workspaceId: string; dirty: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function exportCsv() {
    startTransition(async () => {
      setError(null);
      const result = await exportWorkspaceCsvAction({ workspaceId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // A BOM so Excel reads it as UTF-8.
      const blob = new Blob(["﻿" + result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex max-w-56 flex-col gap-1">
      <button type="button" onClick={exportCsv} disabled={isPending} className={secondaryButtonClass}>
        <Download aria-hidden="true" className="size-4" /> {isPending ? "Exporting…" : "Export CSV"}
      </button>
      {dirty && <p className={hintClass}>The export uses the last save; unsaved changes aren&apos;t in it.</p>}
      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
