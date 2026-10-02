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
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteEstimate } from "./actions";

export function DeleteEstimateButton({ estimateId }: { estimateId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteEstimate(estimateId);
      if (result?.error) {
        setError(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setError(null);
        }}
      >
        <DialogTrigger render={<Button type="button" variant="outline" />}>Delete estimate</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete estimate</DialogTitle>
            <DialogDescription>Delete this saved estimate? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
