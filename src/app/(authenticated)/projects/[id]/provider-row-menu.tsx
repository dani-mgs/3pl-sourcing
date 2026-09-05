"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProvider } from "./providers/[providerId]/actions";

export function ProviderRowMenu({
  projectId,
  providerId,
  companyName,
  canWrite,
}: {
  projectId: string;
  providerId: string;
  companyName: string;
  canWrite: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deleteProvider(projectId, providerId);
      if (result?.error) {
        setError(result.error);
        setConfirmOpen(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Row actions"
          className="flex size-9 items-center justify-center rounded-lg border border-neutral-border bg-white text-lg font-bold leading-none text-move-navy outline-none hover:bg-neutral-bg hover:border-move-navy/40 focus-visible:ring-2 focus-visible:ring-move-green aria-expanded:bg-neutral-bg"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/projects/${projectId}/providers/${providerId}`} />}
          >
            View
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuItem
                render={
                  <Link
                    href={`/projects/${projectId}/providers/${providerId}/edit`}
                  />
                }
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setError(null);
                  setConfirmOpen(true);
                }}
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete provider</DialogTitle>
            <DialogDescription>
              Delete {companyName}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
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
    </>
  );
}
