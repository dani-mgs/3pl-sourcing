"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateSummaryNotes, type SaveNotesState } from "./notes-actions";
import { SUMMARY_NOTES_MAX } from "@/lib/three-pl/parse-project-form";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-neutral-muted";

export function NotesCard({
  clientRequirementId,
  initialNotes,
  canWrite,
}: {
  clientRequirementId: string;
  initialNotes: string | null;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveNotesState,
    FormData
  >(
    async (_prevState, formData) =>
      updateSummaryNotes(clientRequirementId, formData),
    {},
  );
  // A live count instead of maxLength, which would silently cut a long paste.
  const [length, setLength] = useState((initialNotes ?? "").length);
  const over = length > SUMMARY_NOTES_MAX;

  return (
    <section className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
        Notes
      </h2>
      <form action={formAction} className="flex flex-col gap-3">
        <textarea
          name="summary_notes"
          rows={4}
          placeholder="Add project notes..."
          defaultValue={initialNotes ?? ""}
          disabled={!canWrite}
          onChange={(e) => setLength(e.target.value.length)}
          aria-describedby="summary-notes-count"
          aria-invalid={over || undefined}
          className={over ? `${fieldClass} border-danger` : fieldClass}
        />
        {canWrite && (
          <p
            id="summary-notes-count"
            className={`text-right text-xs ${over ? "font-medium text-danger" : "text-neutral-muted"}`}
          >
            {length.toLocaleString("en-US")} / {SUMMARY_NOTES_MAX.toLocaleString("en-US")}
            {over && " (too long)"}
          </p>
        )}

        {canWrite && (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={pending}
              className="self-start px-4 py-2.5"
            >
              {pending ? "Saving..." : "Save Notes"}
            </Button>
            {state.success && (
              <span className="text-sm font-medium text-move-green">
                Saved
              </span>
            )}
            {state.error && (
              <span className="text-sm text-danger">{state.error}</span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
