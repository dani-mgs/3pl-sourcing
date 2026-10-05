"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dutyEstimatesLabel } from "./duty-estimate-links";
import { deleteForwarder } from "./forwarders/[forwarderId]/actions";

// Shared by the Forwarders table's row menu and the forwarder detail page's
// "⋯" menu, so both confirm with the same copy.
export function DeleteForwarderDialog({
  projectId,
  forwarderId,
  companyName,
  dutyEstimateCount,
  open,
  onOpenChange,
}: {
  projectId: string;
  forwarderId: string;
  companyName: string;
  // Duty estimates linked to its quotes, deleted with them.
  dutyEstimateCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Clear a previous attempt's error each time the dialog opens (the menus
  // open it by setting `open`, not through onOpenChange).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError(null);
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      // On success deleteForwarder redirects back to Project Summary. On
      // failure keep the dialog open — the error renders inside it, so
      // closing would hide the failure entirely.
      const result = await deleteForwarder(projectId, forwarderId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Forwarder</DialogTitle>
          <DialogDescription>
            Delete {companyName}? This also deletes all of its quotes
            {dutyEstimateCount > 0 && <> and {dutyEstimatesLabel(dutyEstimateCount)}</>}. This can&apos;t be
            undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
