"use client";

import Link from "next/link";
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
import { dutyEstimatesLabel, estimateDutiesHref } from "../../duty-estimate-links";
import { deleteQuote } from "./quotes/[quoteId]/actions";

// Edit / Delete for one quote row. Only rendered for users who can write.
export function QuoteRowMenu({
  projectId,
  forwarderId,
  quoteId,
  scenarioGroup,
  dutyEstimateCount,
}: {
  projectId: string;
  forwarderId: string;
  quoteId: string;
  scenarioGroup: string;
  dutyEstimateCount: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deleteQuote(projectId, forwarderId, quoteId);
      if (result?.error) {
        setError(result.error);
      } else {
        setConfirmOpen(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Row actions"
          className="flex size-9 items-center justify-center rounded-lg border border-neutral-border bg-white text-lg font-bold leading-none text-move-navy outline-none hover:border-move-navy/40 hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green aria-expanded:bg-neutral-bg"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={
              <Link
                href={`/forwarder-sourcing/${projectId}/forwarders/${forwarderId}/quotes/${quoteId}/edit`}
              />
            }
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={estimateDutiesHref(projectId, quoteId)} />}>
            Estimate duties for this quote
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
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quote</DialogTitle>
            <DialogDescription>
              Delete this {scenarioGroup} quote
              {dutyEstimateCount > 0 && <> and {dutyEstimatesLabel(dutyEstimateCount)}</>}? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={isPending}>
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
