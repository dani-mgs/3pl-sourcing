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
import { deleteWorkspaceAction } from "../actions";
import { errorTextClass } from "../styles";

// Deletes the workspace and everything in it, after a confirmation, then
// goes back to the list. Shown to its owner or an admin only.
export function DeleteWorkspaceButton({
  workspaceId,
  name,
  disabled = false,
}: {
  workspaceId: string;
  name: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
              Delete &ldquo;{name}&rdquo; with all its SKUs, inputs and costs? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
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
