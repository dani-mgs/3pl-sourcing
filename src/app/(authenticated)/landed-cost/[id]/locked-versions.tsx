"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSnapshotAction, lockWorkspaceAction } from "../actions";
import { cardClass, errorTextClass, hintClass, secondaryButtonClass, sectionTitleClass } from "../styles";

export type VersionRow = {
  id: string;
  versionNo: number;
  lockedOn: string;
  byName: string;
  baselineLabel: string;
  baselinePerUnit: string;
  incomplete: boolean;
  canDelete: boolean;
};

// "Lock this version" (owner or admin): freezes the last save and its result
// as the next version. Disabled, with the reason, while there are unsaved
// changes or an origin is incomplete.
export function LockVersionButton({
  workspaceId,
  updatedAt,
  dirty,
  blocker,
  disabled,
}: {
  workspaceId: string;
  updatedAt: string;
  dirty: boolean;
  blocker: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ id: string; versionNo: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const reason = dirty ? "Save your changes first: a version locks the last save." : blocker;

  function lock() {
    startTransition(async () => {
      setError(null);
      const result = await lockWorkspaceAction({ workspaceId, expectedUpdatedAt: updatedAt });
      setOpen(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocked({ id: result.versionId, versionNo: result.versionNo });
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-72 flex-col gap-1">
      <button type="button" className={secondaryButtonClass} disabled={disabled || isPending || reason != null} onClick={() => setOpen(true)}>
        <Lock aria-hidden="true" className="size-4" /> {isPending ? "Locking…" : "Lock this version"}
      </button>
      {reason && <p className={hintClass}>{reason}</p>}
      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
      {locked && (
        <p className="text-xs text-move-navy" role="status">
          Locked as v{locked.versionNo}.{" "}
          <Link href={`/landed-cost/${workspaceId}/versions/${locked.id}`} className="font-medium text-move-green hover:underline">
            View v{locked.versionNo}
          </Link>
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock this version</DialogTitle>
            <DialogDescription>
              Freezes the last save and its result, with today&apos;s duty data, as the next numbered version. A locked version can&apos;t be
              changed; it can be deleted. The workspace stays editable.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={lock} disabled={isPending}>
              {isPending ? "Locking…" : "Lock version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeleteVersionButton({ version }: { version: VersionRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteSnapshotAction({ snapshotId: version.id });
      setOpen(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-md p-1.5 text-neutral-muted hover:bg-neutral-bg hover:text-danger focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        <span className="sr-only">Delete v{version.versionNo}</span>
      </button>
      {error && (
        <span className={`${errorTextClass} block`} role="alert">
          {error}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete v{version.versionNo}</DialogTitle>
            <DialogDescription>
              Delete locked version v{version.versionNo} ({version.lockedOn})? This cannot be undone. The workspace isn&apos;t changed.
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
    </>
  );
}

// "Locked versions", for every staff viewer; newest first.
export function LockedVersionsList({ workspaceId, versions, loadFailed }: { workspaceId: string; versions: VersionRow[]; loadFailed: boolean }) {
  return (
    <section className={cardClass} aria-labelledby="lc-versions-title">
      <h2 id="lc-versions-title" className={sectionTitleClass}>
        Locked versions
      </h2>
      {loadFailed ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          Locked versions couldn&apos;t be loaded right now. Reload to try again.
        </p>
      ) : versions.length === 0 ? (
        <p className={`${hintClass} mt-2`}>None yet. Lock a version to keep this result as it is today.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm text-move-navy">
          <thead>
            <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
              <th scope="col" className="py-2 pr-3 font-medium">Version</th>
              <th scope="col" className="py-2 pr-3 font-medium">Locked on</th>
              <th scope="col" className="py-2 pr-3 font-medium">By</th>
              <th scope="col" className="py-2 pr-3 font-medium">Baseline</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Per unit</th>
              <th scope="col" className="py-2">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b border-neutral-border align-top last:border-0">
                <td className="py-2 pr-3">
                  <Link href={`/landed-cost/${workspaceId}/versions/${v.id}`} className="font-medium text-move-green hover:underline">
                    v{v.versionNo}
                  </Link>
                  {v.incomplete && (
                    <span className="ml-2 rounded-full bg-[#FFFBEB] px-2 py-0.5 text-xs font-semibold text-[#92400E]">Incomplete</span>
                  )}
                </td>
                <td className="py-2 pr-3">{v.lockedOn}</td>
                <td className="py-2 pr-3">{v.byName}</td>
                <td className="py-2 pr-3">{v.baselineLabel}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{v.baselinePerUnit}</td>
                <td className="py-2 text-right">{v.canDelete && <DeleteVersionButton version={v} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
