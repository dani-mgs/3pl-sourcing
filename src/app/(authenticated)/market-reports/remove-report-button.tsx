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

import { removeMarketReport } from "./actions";

// Admins only (the page shows it to admins; the action and RLS check again).
export function RemoveReportButton({ projectId, reportId }: { projectId: string; reportId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMarketReport(projectId, reportId);
      if ("error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Remove this report (admin)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this published Market Report?</DialogTitle>
            <DialogDescription>
              Only for a report that was a mistake: the client will see the previous report instead, if there is one. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onRemove} disabled={isPending}>
              {isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
