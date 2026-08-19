"use client";

import { useState, useTransition } from "react";
import { deleteDocument } from "./actions";

export function DeleteDocumentButton({
  projectId,
  documentId,
  fileName,
}: {
  projectId: string;
  documentId: string;
  fileName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteDocument(projectId, documentId);
      setConfirming(false);
      setError(result.error ?? null);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="text-sm font-medium text-danger-rose hover:underline"
      >
        Delete
      </button>

      {error && <p className="max-w-40 text-right text-xs text-danger-rose">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-navy/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-fog bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-ink-navy">
              Delete document
            </h2>
            <p className="mt-2 text-sm text-slate">
              Delete {fileName}? This cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-xl border border-fog px-4 py-2.5 text-sm font-medium text-ink-navy hover:bg-mist disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-xl bg-danger-rose px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-danger-rose/90 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
