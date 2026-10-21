"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCw } from "lucide-react";
import {
  applySaveResult,
  isDirty,
  issueTarget,
  toEditorDraft,
  toSaveInput,
  type EditorDraft,
} from "@/lib/landed-cost/editor-draft";
import type { ResultView } from "@/lib/landed-cost/result-view";
import type { Workspace } from "@/lib/landed-cost/workspace-schema";
import type { LookupRelease } from "../../tariff-calculator/hts-lookup/hts-lookup-dialog";
import { saveDraftAction } from "../actions";
import { primaryButtonClass, secondaryButtonClass } from "../styles";
import { DeleteWorkspaceButton } from "./delete-workspace-button";
import type { FieldErrors } from "./fields";
import { FreightSection } from "./freight-section";
import { OtherCostsSection } from "./other-costs-section";
import { ResultPanel } from "./result-panel";
import { ShipmentSection, type EntryDateBounds } from "./shipment-section";
import { SkuTable } from "./sku-table";
import { useUnsavedWarning } from "./use-unsaved-warning";

type SaveErrors = { message: string; summary: { message: string; targetId: string | null }[]; fields: FieldErrors };

const STALE = "This workspace was changed by someone else. Reload to see the latest version.";

// The workspace's inputs as a local draft, saved whole with "Save draft".
// After a save the page reloads from the server (this editor is keyed on the
// workspace's updated_at), so the result is recalculated from what was
// saved. updated_at is kept as the exact text the database returned and sent
// back unchanged; a save after someone else's is refused, never merged.
export function WorkspaceEditor({
  workspace,
  view,
  canEdit,
  ownerName,
  countries,
  bounds,
  lastSaved,
  htsRelease,
}: {
  workspace: Workspace;
  view: ResultView;
  canEdit: boolean;
  ownerName: string;
  countries: readonly { code: string; name: string }[];
  bounds: EntryDateBounds;
  lastSaved: string;
  htsRelease: LookupRelease | null;
}) {
  const router = useRouter();
  // The page renders this editor only for a workspace with a scenario.
  const [saved, setSaved] = useState<EditorDraft>(() => toEditorDraft(workspace)!);
  const [draft, setDraft] = useState<EditorDraft>(saved);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(workspace.updatedAt);
  const [errors, setErrors] = useState<SaveErrors | null>(null);
  const [stale, setStale] = useState(false);
  const [isPending, startTransition] = useTransition();
  const refCount = useRef(0);
  const dirty = isDirty(draft, saved);
  useUnsavedWarning(canEdit && dirty);

  const disabled = !canEdit || isPending;
  const update = (change: (d: EditorDraft) => EditorDraft) => setDraft((d) => change(d));
  const newRef = () => `new-${Date.now().toString(36)}-${++refCount.current}`;

  function save() {
    startTransition(async () => {
      setErrors(null);
      const result = await saveDraftAction(toSaveInput(draft, workspace.id, expectedUpdatedAt));
      if (!result.ok) {
        if (result.code === "stale") {
          setStale(true);
          return;
        }
        const summary = (result.issues ?? []).map((i) => ({ message: i.message, targetId: issueTarget(i.path, draft) }));
        const fields: FieldErrors = {};
        for (const s of summary) if (s.targetId && !fields[s.targetId]) fields[s.targetId] = s.message;
        setErrors({ message: result.error, summary, fields });
        return;
      }
      const next = applySaveResult(draft, result.ids);
      setDraft(next);
      setSaved(next);
      setExpectedUpdatedAt(result.updatedAt);
      // Recalculate on the server from what was just saved.
      router.refresh();
    });
  }

  const sectionProps = { draft, disabled, errors: errors?.fields ?? {}, update };

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">{draft.name || workspace.name}</h1>
          <p className="mt-1 text-sm text-neutral-muted">
            {draft.scenario.label} · Owned by {ownerName} · Last saved {lastSaved}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-start gap-3">
            {dirty && (
              <span className="self-center text-sm font-medium text-[#92400E]" role="status">
                Unsaved changes
              </span>
            )}
            <button type="button" onClick={save} disabled={isPending || stale} className={primaryButtonClass}>
              {isPending ? "Saving…" : "Save draft"}
            </button>
            <DeleteWorkspaceButton workspaceId={workspace.id} name={workspace.name} disabled={isPending} />
          </div>
        )}
      </div>

      {!canEdit && (
        <p className="flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-4 py-3 text-sm text-move-navy" role="status">
          <Eye aria-hidden="true" className="size-4 shrink-0" />
          Owned by {ownerName}, view only.
        </p>
      )}
      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]" role="alert">
          <p className="font-medium">{STALE} Your unsaved changes will be lost.</p>
          <button type="button" onClick={() => startTransition(() => router.refresh())} className={secondaryButtonClass}>
            <RefreshCw aria-hidden="true" className="size-4" /> Reload
          </button>
        </div>
      )}
      {errors && (
        <div className="rounded-xl border border-danger/40 bg-[#FDE8E8] px-4 py-3 text-sm text-[#991B1B]" role="alert">
          <p className="font-semibold">Not saved: {errors.message}</p>
          {errors.summary.length > 1 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {errors.summary.map((s, i) => (
                <li key={`${i}-${s.message}`}>
                  {s.targetId ? (
                    <button type="button" className="text-left underline underline-offset-2" onClick={() => document.getElementById(s.targetId!)?.focus()}>
                      {s.message}
                    </button>
                  ) : (
                    s.message
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ShipmentSection {...sectionProps} countries={countries} bounds={bounds} />
          <SkuTable {...sectionProps} dutyQuantityUnits={view.dutyQuantityUnits} htsRelease={htsRelease} newRef={newRef} />
          <FreightSection {...sectionProps} />
          <OtherCostsSection {...sectionProps} newRef={newRef} />
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <ResultPanel view={view} dirty={dirty} lastSaved={lastSaved} />
        </aside>
      </div>
    </div>
  );
}
