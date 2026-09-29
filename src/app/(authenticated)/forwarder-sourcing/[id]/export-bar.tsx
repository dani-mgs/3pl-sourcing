"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportForwarderReportCsv, type ExportCsvState, type ExportVersion } from "./export-actions";

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

export function ExportBar({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function runExport(label: string, version: ExportVersion) {
    setError(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result = await exportForwarderReportCsv(projectId, version);
      setError(downloadCsv(result));
      setPendingLabel(null);
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-muted">CSV:</span>
        <Button
          variant="outline"
          className="px-3 py-1.5 text-sm"
          disabled={isPending}
          onClick={() => runExport("Client CSV", "client")}
        >
          {pendingLabel === "Client CSV" ? "Exporting..." : "Client CSV"}
        </Button>
        <Button
          variant="outline"
          className="px-3 py-1.5 text-sm"
          disabled={isPending}
          onClick={() => runExport("Expert CSV", "expert")}
        >
          {pendingLabel === "Expert CSV" ? "Exporting..." : "Expert CSV"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
