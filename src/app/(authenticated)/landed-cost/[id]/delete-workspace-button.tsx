"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { hasLockedVersions } from "@/lib/landed-cost/draft-errors";
import { deleteWorkspaceAction } from "../actions";
import { errorTextClass } from "../styles";

// What the dialog says and offers.
export function deleteDialogContent(name: string, lockedVersionCount: number | null) {
  return lockedVersionCount != null && lockedVersionCount > 0
    ? { message: hasLockedVersions(lockedVersionCount), offerDelete: false, closeLabel: "Close" }
    : { message: `Delete \u201c${name}\u201d with all its SKUs, inputs and costs? This cannot be undone.`, offerDelete: true, closeLabel: "Cancel" };
}

// Deletes the workspace and everything in it, after a confirmation, then
// goes back to the list. Shown to its owner or an admin only. Locked
// versions keep their workspace, so with any the dialog says to delete them
// first and offers no Delete (the action refuses too, for a stale page).
// lockedVersionCount null: the versions list couldn't be loaded, so the
// action decides.
export function DeleteWorkspaceButton({
  workspaceId,
  name,
  lockedVersionCount = null,
  disabled = false,
}: {
  workspaceId: string;
  name: string;
  lockedVersionCount?: number | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const content = deleteDialogContent(name, lockedVersionCount);

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteWorkspaceAction({ workspaceId });
      if (!result.ok) {
        setError(result.error);
        setOpen(false);
        return;
      }
      router.push("/landed-cost");
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setError(null);
        }}
      >
        <DialogTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>Delete workspace</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              {content.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {content.closeLabel}
            </Button>
            {content.offerDelete && (
              <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isPending}>
                {isPending ? "Deleting…" : "Delete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
