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
import { deleteClient } from "./client-actions";

// Only a client with no projects and no portal users can be deleted. While it
// has any, the button stays disabled and the reason is shown next to it.
export function DeleteClientButton({
  clientId,
  clientName,
  projectCount,
  portalUserCount = 0,
}: {
  clientId: string;
  clientName: string;
  projectCount: number;
  portalUserCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (projectCount > 0 || portalUserCount > 0) {
    const reasonId = `delete-client-reason-${clientId}`;
    const reasons = [
      projectCount > 0 && `${projectCount} project${projectCount === 1 ? "" : "s"}`,
      portalUserCount > 0 && `${portalUserCount} portal user${portalUserCount === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return (
      <div className="flex items-center gap-2">
        <span id={reasonId} className="text-xs text-neutral-muted">
          Has {reasons.join(" and ")}
        </span>
        <Button
          type="button"
          variant="destructive"
          disabled
          aria-describedby={reasonId}
        >
          Delete
        </Button>
      </div>
    );
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteClient(clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Client</DialogTitle>
          <DialogDescription>
            Delete {clientName}? It has no projects or portal users. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
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
