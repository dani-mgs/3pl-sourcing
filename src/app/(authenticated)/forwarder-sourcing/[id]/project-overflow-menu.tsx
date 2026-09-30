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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteForwarderProject } from "../actions";

// "⋯" menu for project-level actions that don't need a primary button. Only
// rendered for users who can write to the project.
export function ProjectOverflowMenu({
  projectId,
  clientName,
  forwarderCount,
}: {
  projectId: string;
  clientName: string;
  forwarderCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      // On success the action redirects to the project list. On failure the
      // dialog stays open with the error shown inside it.
      const result = await deleteForwarderProject(projectId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More project actions"
          className="flex size-9 items-center justify-center rounded-xl border border-neutral-border bg-white text-lg font-bold leading-none text-move-navy outline-none hover:border-move-navy/40 hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green aria-expanded:bg-neutral-bg"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            Delete Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {forwarderCount > 0 ? (
            <DialogHeader>
              <DialogTitle>Can&apos;t delete this project</DialogTitle>
              <DialogDescription>
                This project has {forwarderCount} forwarder(s) attached. Delete
                them first, then delete this project.
              </DialogDescription>
            </DialogHeader>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete Project</DialogTitle>
                <DialogDescription>
                  Delete this forwarder project for {clientName}? The client
                  itself is kept for other projects. This cannot be undone.
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
