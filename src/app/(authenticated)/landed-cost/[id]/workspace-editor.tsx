"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Info, RefreshCw } from "lucide-react";
import { applySaveResult, isDirty, issueTarget, toEditorDraft, toSaveInput, type EditorDraft } from "@/lib/landed-cost/editor-draft";
import type { ComparisonView } from "@/lib/landed-cost/comparison-view";
import type { ResultView } from "@/lib/landed-cost/result-view";
import type { DutyUnit } from "@/lib/landed-cost/server-compute";
import type { Workspace } from "@/lib/landed-cost/workspace-schema";
import type { LookupRelease } from "../../tariff-calculator/hts-lookup/hts-lookup-dialog";
import { saveDraftAction } from "../actions";
import { cardClass, primaryButtonClass, secondaryButtonClass } from "../styles";
import { CompareAfterSave, ComparisonArea } from "./comparison-area";
import { DeleteWorkspaceButton } from "./delete-workspace-button";
import { ExportCsvButton } from "./export-csv-button";
import type { FieldErrors } from "./fields";
import { FreightSection } from "./freight-section";
import { AddOriginButtons, OriginActions, OriginTabs } from "./origin-controls";
import { OtherCostsSection } from "./other-costs-section";
import { ResultPanel } from "./result-panel";
import { ShipmentSection, WorkspaceFields, type Countries, type EntryDateBounds } from "./shipment-section";
import { SkuTable } from "./sku-table";
import { useUnsavedWarning } from "./use-unsaved-warning";

type SaveErrors = { message: string; summary: { message: string; id: string | null; scenarioRef: string | null }[]; fields: FieldErrors };

const STALE = "This workspace was changed by someone else. Reload to see the latest version.";
const PANEL_ID = "lc-origin-panel";

// The selected origin is kept in ?origin=, so it survives the reload after a save.
function rememberOrigin(ref: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("origin", ref);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Only a convenience.
  }
}

// The workspace's inputs as a local draft, saved whole with "Save draft".
// After a save the page reloads from the server (this editor is keyed on the
// workspace's updated_at), so results and the comparison are recalculated
// from what was saved. updated_at is kept as the exact text the database
// returned and sent back unchanged; a save after someone else's is refused,
// never merged. One origin: the Phase 2c-2 layout. Several: the comparison,
// the shared SKUs, then one tab per origin.
export function WorkspaceEditor({
  workspace,
  views,
  comparison,
  canEdit,
  ownerName,
  countries,
  bounds,
  lastSaved,
  htsRelease,
  initialOrigin,
}: {
  workspace: Workspace;
  views: Record<string, ResultView>;
  comparison: ComparisonView;
  canEdit: boolean;
  ownerName: string;
  countries: Countries;
  bounds: EntryDateBounds;
  lastSaved: string;
  htsRelease: LookupRelease | null;
  initialOrigin: string | null;
}) {
  const router = useRouter();
  // The page renders this editor only for a workspace with a scenario.
  const [saved, setSaved] = useState<EditorDraft>(() => toEditorDraft(workspace)!);
  const [draft, setDraft] = useState<EditorDraft>(saved);
  const [selectedRef, setSelectedRef] = useState(() =>
    initialOrigin && saved.scenarios.some((s) => s.ref === initialOrigin) ? initialOrigin : saved.baselineRef,
  );
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(workspace.updatedAt);
  const [errors, setErrors] = useState<SaveErrors | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refCount = useRef(0);
  const dirty = isDirty(draft, saved);
  useUnsavedWarning(canEdit && dirty);

  const disabled = !canEdit || isPending;
  const update = (change: (d: EditorDraft) => EditorDraft) => setDraft((d) => change(d));
  const newRef = () => `new-${Date.now().toString(36)}-${++refCount.current}`;
  const select = (ref: string) => {
    setSelectedRef(ref);
    rememberOrigin(ref);
  };
  const multi = draft.scenarios.length > 1;
  const selected = draft.scenarios.find((s) => s.ref === selectedRef) ?? draft.scenarios[0];
  // The rate's unit for a duty quantity, from any origin's last result.
  const dutyQuantityUnits = Object.values(views).reduce<Record<string, DutyUnit>>((all, v) => ({ ...v.dutyQuantityUnits, ...all }), {});

  function save() {
    startTransition(async () => {
      setErrors(null);
      setNotice(null);
      const result = await saveDraftAction(toSaveInput(draft, workspace.id, expectedUpdatedAt));
      if (!result.ok) {
        if (result.code === "stale") {
          setStale(true);
          return;
        }
        const summary = (result.issues ?? []).map((i) => ({ message: i.message, ...issueTarget(i.path, draft) }));
        const fields: FieldErrors = {};
        for (const s of summary) if (s.id && !fields[s.id]) fields[s.id] = s.message;
        setErrors({ message: result.error, summary, fields });
        // Show the first origin with a problem.
        const first = summary.find((s) => s.scenarioRef)?.scenarioRef;
        if (first) select(first);
        return;
      }
      const next = applySaveResult(draft, result.ids);
      setDraft(next);
      setSaved(next);
      setExpectedUpdatedAt(result.updatedAt);
      select(result.ids.scenarios[selectedRef] ?? selectedRef);
      // Recalculate on the server from what was just saved.
      router.refresh();
    });
  }

  function focusError(s: SaveErrors["summary"][number]) {
    if (s.scenarioRef) select(s.scenarioRef);
    requestAnimationFrame(() => s.id && document.getElementById(s.id)?.focus());
  }

  const sectionProps = { draft, disabled, errors: errors?.fields ?? {}, update };
  const panel = (
    <aside className="xl:sticky xl:top-24 xl:self-start">
      <ResultPanel view={selected.id ? (views[selected.id] ?? null) : null} dirty={dirty} lastSaved={lastSaved} originLabel={multi ? selected.label : null} />
    </aside>
  );
  const paste = canEdit ? { originRef: selected.ref, onApplied: setNotice } : null;
  const addOrigin = canEdit && (
    <AddOriginButtons draft={draft} sourceRef={selected.ref} countries={countries} disabled={disabled} update={update} newRef={newRef} onAdded={select} />
  );

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">{draft.name || workspace.name}</h1>
          <p className="mt-1 text-sm text-neutral-muted">
            {multi ? `${draft.scenarios.length} origins` : selected.label} · Owned by {ownerName} · Last saved {lastSaved}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <ExportCsvButton workspaceId={workspace.id} dirty={canEdit && dirty} />
          {canEdit && (
            <>
              {dirty && (
                <span className="self-center text-sm font-medium text-[#92400E]" role="status">
                  Unsaved changes
                </span>
              )}
              {/* One origin: adding another starts the comparison. */}
              {!multi && addOrigin}
              <button type="button" onClick={save} disabled={isPending || stale} className={primaryButtonClass}>
                {isPending ? "Saving…" : "Save draft"}
              </button>
              <DeleteWorkspaceButton workspaceId={workspace.id} name={workspace.name} disabled={isPending} />
            </>
          )}
        </div>
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
      {notice && (
        <p className="flex items-center gap-2 rounded-xl bg-neutral-bg px-4 py-3 text-sm text-move-navy" role="status">
          <Info aria-hidden="true" className="size-4 shrink-0" /> {notice}
        </p>
      )}
      {errors && (
        <div className="rounded-xl border border-danger/40 bg-[#FDE8E8] px-4 py-3 text-sm text-[#991B1B]" role="alert">
          <p className="font-semibold">Not saved: {errors.message}</p>
          {errors.summary.length > 1 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {errors.summary.map((s, i) => (
                <li key={`${i}-${s.message}`}>
                  {s.id ? (
                    <button type="button" className="text-left underline underline-offset-2" onClick={() => focusError(s)}>
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

      {multi && (comparison.state === "hidden" ? <CompareAfterSave /> : <ComparisonArea view={comparison} dirty={dirty} />)}

      {!multi ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-6">
            <ShipmentSection {...sectionProps} scenario={selected} workspaceFields countries={countries} bounds={bounds} />
            <SkuTable {...sectionProps} mode="combined" scenario={selected} dutyQuantityUnits={dutyQuantityUnits} htsRelease={htsRelease} newRef={newRef} paste={paste} />
            <FreightSection {...sectionProps} scenario={selected} step="3" />
            <OtherCostsSection {...sectionProps} scenario={selected} step="4" newRef={newRef} />
          </div>
          {panel}
        </div>
      ) : (
        <>
          <section className={cardClass} aria-label="Workspace">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <WorkspaceFields {...sectionProps} bounds={bounds} />
            </div>
          </section>
          <SkuTable {...sectionProps} mode="shared" scenario={null} dutyQuantityUnits={dutyQuantityUnits} htsRelease={htsRelease} newRef={newRef} paste={paste} />
          <div className="flex flex-col gap-4">
            <OriginTabs draft={draft} selectedRef={selected.ref} onSelect={select} countries={countries} panelId={PANEL_ID} />
            {canEdit && (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <OriginActions
                  draft={draft}
                  selectedRef={selected.ref}
                  disabled={disabled}
                  update={update}
                  onRemoved={({ selectRef, newBaselineLabel }) => {
                    select(selectRef);
                    setNotice(newBaselineLabel ? `${newBaselineLabel} is now the baseline (not saved yet).` : null);
                  }}
                />
                {addOrigin}
              </div>
            )}
          </div>
          <div id={PANEL_ID} role="tabpanel" aria-labelledby={`lc-tab-${selected.ref}`} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="flex min-w-0 flex-col gap-6">
              <ShipmentSection {...sectionProps} scenario={selected} workspaceFields={false} countries={countries} bounds={bounds} />
              <SkuTable {...sectionProps} mode="items" scenario={selected} dutyQuantityUnits={dutyQuantityUnits} htsRelease={htsRelease} newRef={newRef} />
              <FreightSection {...sectionProps} scenario={selected} step="C" />
              <OtherCostsSection {...sectionProps} scenario={selected} step="D" newRef={newRef} />
            </div>
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
