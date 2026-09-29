"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  exportForwardersCsv,
  exportProjectCsv,
  exportQuotesCsv,
  type ExportCsvState,
  type ExportVersion,
} from "./export-actions";

// Matches the "My Projects / All Experts" tab style used elsewhere in this
// module (forwarder-project-list.tsx).
const tabClass = (active: boolean) =>
  active
    ? "rounded-full bg-move-green px-4 py-1.5 text-sm font-medium text-white"
    : "rounded-full border border-neutral-border px-4 py-1.5 text-sm font-medium text-neutral-muted hover:bg-neutral-bg";

function downloadCsv(state: ExportCsvState) {
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
  const [version, setVersion] = useState<ExportVersion>("client");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function runExport(
    label: string,
    action: (projectId: string, version: ExportVersion) => Promise<ExportCsvState>,
  ) {
    setError(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result = await action(projectId, version);
      setError(downloadCsv(result));
      setPendingLabel(null);
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-muted">Export as:</span>
          <button
            type="button"
            onClick={() => setVersion("client")}
            className={tabClass(version === "client")}
          >
            Client version
          </button>
          <button
            type="button"
            onClick={() => setVersion("expert")}
            className={tabClass(version === "expert")}
          >
            Expert version
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="px-3 py-1.5 text-sm"
            disabled={isPending}
            onClick={() => runExport("Project Details", exportProjectCsv)}
          >
            {pendingLabel === "Project Details" ? "Exporting..." : "Export Project Details"}
          </Button>
          <Button
            variant="outline"
            className="px-3 py-1.5 text-sm"
            disabled={isPending}
            onClick={() => runExport("Forwarders", exportForwardersCsv)}
          >
            {pendingLabel === "Forwarders" ? "Exporting..." : "Export Forwarders"}
          </Button>
          <Button
            variant="outline"
            className="px-3 py-1.5 text-sm"
            disabled={isPending}
            onClick={() => runExport("Quote Comparison", exportQuotesCsv)}
          >
            {pendingLabel === "Quote Comparison" ? "Exporting..." : "Export Quote Comparison"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
