"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteForwarderDialog } from "../../delete-forwarder-dialog";

// "⋯" menu beside Edit on the forwarder detail page. Only rendered for users
// who can write to the project.
export function ForwarderOverflowMenu({
  projectId,
  forwarderId,
  companyName,
}: {
  projectId: string;
  forwarderId: string;
  companyName: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More forwarder actions"
          className="flex size-9 items-center justify-center rounded-xl border border-neutral-border bg-white text-lg font-bold leading-none text-move-navy outline-none hover:border-move-navy/40 hover:bg-neutral-bg focus-visible:ring-2 focus-visible:ring-move-green aria-expanded:bg-neutral-bg"
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete Forwarder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteForwarderDialog
        projectId={projectId}
        forwarderId={forwarderId}
        companyName={companyName}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}
