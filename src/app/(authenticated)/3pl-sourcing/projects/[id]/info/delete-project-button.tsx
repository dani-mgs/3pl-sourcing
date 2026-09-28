"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { deleteProject } from "./delete-project-actions";

export function DeleteProjectButton({
  projectId,
  clientName,
  providerCount,
}: {
  projectId: string;
  clientName: string;
  providerCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      // On success deleteProject redirects to the project list. On failure
      // the dialog stays open with the error shown inside it.
      const result = await deleteProject(projectId);
      if (result?.error) {
        setError(result.error);
      }
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
        Delete Project
      </DialogTrigger>
      <DialogContent>
        {providerCount > 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Can&apos;t delete this project</DialogTitle>
              <DialogDescription>
                This project has {providerCount} 3PL(s) attached. Delete them
                first, then delete this project.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/3pl-sourcing/projects/${projectId}`} />}
                onClick={() => setOpen(false)}
              >
                Go to Project
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                Delete this 3PL project for {clientName}? The client itself
                is kept for other projects. This cannot be undone.
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
  );
}
