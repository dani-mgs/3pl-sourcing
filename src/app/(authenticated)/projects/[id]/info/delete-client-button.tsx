"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteClientRequirement } from "./delete-client-actions";

export function DeleteClientButton({
  clientRequirementId,
  clientName,
  providerCount,
}: {
  clientRequirementId: string;
  clientName: string;
  providerCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteClientRequirement(clientRequirementId);
      if (result?.error) {
        setError(result.error);
        setOpen(false);
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
        Delete Client
      </DialogTrigger>
      <DialogContent>
        {providerCount > 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Can&apos;t delete this client</DialogTitle>
              <DialogDescription>
                This client has {providerCount} 3PL(s) attached. Delete or
                reassign them before deleting this client.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projects/${clientRequirementId}`} />}
                onClick={() => setOpen(false)}
              >
                Go to Project
              </Button>
              <DialogClose render={<Button type="button" />}>
                Close
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete Client</DialogTitle>
              <DialogDescription>
                Delete {clientName}? This cannot be undone.
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
          </>
        )}
      </DialogContent>

      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
