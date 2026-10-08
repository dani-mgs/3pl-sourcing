"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatRateDate } from "@/lib/fx/rate-provenance";
import { NOTE_MAX, type ChecklistView } from "@/lib/checklist/checklist";
import { ReviewStatusBadge } from "../../tariff-calculator/duty-data/review-status-badge";
import { setChecklistItem } from "./actions";

const when = (iso: string | null) => (iso ? formatRateDate(iso.slice(0, 10)) : "");

// One checklist item. Plain native inputs (the values come from the server
// and are refreshed after each action). The live hint is a separate, muted
// label: it never ticks the box.
export function ChecklistItemRow({
  item,
  canChange,
  doneByName,
  updatedByName,
}: {
  item: ChecklistView;
  canChange: boolean;
  doneByName: string | null;
  updatedByName: string | null;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteChanged = note.trim() !== (item.note ?? "");

  function save(done: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setChecklistItem({ itemId: item.id, done, note, version: item.version });
      if (result.error) setError(result.error);
    });
  }

  const checkboxId = `check-${item.key}`;
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid={`item-${item.key}`}>
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={item.done}
          disabled={!canChange || pending}
          onChange={(event) => save(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-move-green disabled:opacity-60"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={checkboxId} className="font-medium text-move-navy">
            {item.title}
            {item.kind === "decision" && (
              <span className="ml-2 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#3730A3]">Decision</span>
            )}
            {item.editable_by === "admin" && !canChange && (
              <span className="ml-2 text-xs font-normal text-neutral-muted">Admin only</span>
            )}
          </label>
          <p className="mt-1 text-sm text-neutral-muted">{item.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {item.link_href && (canChange || item.editable_by === "editor") && (
              <Link
                href={item.link_href}
                className="rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none"
              >
                Open →
              </Link>
            )}
            {item.hint?.kind === "review" && (
              <span className="inline-flex items-center gap-1.5 text-neutral-muted" data-testid="hint">
                Review status in app: <ReviewStatusBadge status={item.hint.status} />
              </span>
            )}
            {item.hint?.kind === "rows" && (
              <span className="text-neutral-muted" data-testid="hint">
                In app: {item.hint.count} {item.hint.count === 1 ? "row" : "rows"} loaded
              </span>
            )}
            {item.hint?.kind === "rate" && (
              <span className="text-neutral-muted" data-testid="hint">
                App currently has: {item.hint.text}
              </span>
            )}
          </div>

          {item.done && (
            <p className="mt-2 text-xs text-neutral-muted" data-testid="done-line">
              Ticked{doneByName ? ` by ${doneByName}` : ""} on {when(item.done_at)}
            </p>
          )}
          {!item.done && item.updated_at && (
            <p className="mt-2 text-xs text-neutral-muted" data-testid="changed-line">
              Last changed{updatedByName ? ` by ${updatedByName}` : ""} on {when(item.updated_at)}
            </p>
          )}
          {item.done && item.updated_at && item.updated_by !== item.done_by && (
            <p className="text-xs text-neutral-muted" data-testid="changed-line">
              Last changed{updatedByName ? ` by ${updatedByName}` : ""} on {when(item.updated_at)}
            </p>
          )}

          {canChange ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
              <textarea
                aria-label={`Note for ${item.title}`}
                value={note}
                maxLength={NOTE_MAX}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note"
                className="w-full rounded-md border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy outline-none focus-visible:ring-2 focus-visible:ring-move-green"
              />
              <div className="flex shrink-0 gap-2">
                {noteChanged && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => save(item.done)}>
                    Save note
                  </Button>
                )}
                {item.done && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
                    Untick
                  </Button>
                )}
              </div>
            </div>
          ) : (
            item.note && (
              <p className="mt-2 rounded-md bg-neutral-bg px-3 py-2 text-sm whitespace-pre-wrap text-move-navy">{item.note}</p>
            )
          )}
          {error && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
