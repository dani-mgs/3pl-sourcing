"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm font-medium text-danger"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Delete
      </Button>

      {error && <p className="max-w-40 text-right text-xs text-danger">{error}</p>}

      {confirming &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-move-navy/40 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-move-navy">
                Delete document
              </h2>
              <p className="mt-2 text-sm text-neutral-muted">
                Delete {fileName}? This cannot be undone.
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="px-4 py-2.5"
                  onClick={handleConfirm}
                  disabled={isPending}
                >
                  {isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
