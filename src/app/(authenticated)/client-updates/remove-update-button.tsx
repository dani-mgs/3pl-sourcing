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
import type { ShareKind } from "@/lib/client-updates/share-paths";
import { removePublishedClientUpdate } from "./actions";

// Admins only (the page shows it to admins; the action and RLS check again).
export function RemoveUpdateButton({ kind, projectId, updateId }: { kind: ShareKind; projectId: string; updateId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removePublishedClientUpdate(kind, projectId, updateId);
      if ("error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Remove this update (admin)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this published update?</DialogTitle>
            <DialogDescription>
              Only for an update that was a mistake: the client will no longer see it. This can&apos;t be undone.
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
