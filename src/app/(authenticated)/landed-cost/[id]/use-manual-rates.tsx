"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorDraft, OverrideRow } from "@/lib/landed-cost/editor-draft";
import {
  asManualDuty,
  asOverride,
  dialogFromRow,
  findOverride,
  isUnsaved,
  keepMyRate,
  overrideDialog,
  removeOverride,
  upsertOverride,
  type ManualRateDialog,
} from "@/lib/landed-cost/manual-rate-draft";
import { BASE_LAYER } from "@/lib/landed-cost/manual-rates";
import type { DutyLayer, ResultView, SkuResultRow } from "@/lib/landed-cost/result-view";
import { ManualRateDialogView } from "./manual-rate-dialog";
import type { ManualEditing } from "./result-panel";

// The manual-rate editor for one origin: what the result panel's and the
// "Manual rates" section's buttons do, and their dialogs. Every change is to
// the local draft; the result updates after "Save draft".

type Update = (change: (d: EditorDraft) => EditorDraft) => void;

const appRateOf = (l: DutyLayer) => `${l.rate} (${l.amount})`;

export function useManualRates({
  draft,
  saved,
  update,
  scenarioRef,
  view,
  newRef,
}: {
  draft: EditorDraft;
  saved: EditorDraft;
  update: Update;
  scenarioRef: string;
  view: ResultView | null;
  newRef: () => string;
}) {
  const [dialog, setDialog] = useState<ManualRateDialog | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const skus: SkuResultRow[] = view && "skus" in view ? view.skus : [];
  const scenario = draft.scenarios.find((s) => s.ref === scenarioRef);
  const skuOf = (skuRef: string) => draft.skus.find((s) => s.ref === skuRef);
  const resultOf = (skuRef: string) => skus.find((s) => s.skuLineId === skuRef);
  const rowsOf = (skuRef: string): OverrideRow[] => scenario?.overrides[skuRef] ?? [];

  // What a draft row is for, and the app's own rate, from the last result.
  function context(skuRef: string, row: OverrideRow) {
    const result = resultOf(skuRef);
    const manual = row.id ? result?.layers.find((l) => l.manual?.overrideId === row.id)?.manual : undefined;
    const engine = result?.layers.find((l) => l.layerKey === row.layerKey && !l.manual);
    const conflict = row.id ? result?.conflicts.find((c) => c.overrideId === row.id) : undefined;
    const layerName =
      row.kind === "add" ? row.label : (manual?.layerName ?? conflict?.layerName ?? engine?.label ?? (row.layerKey === BASE_LAYER ? "Base duty" : row.layerKey));
    return { scenarioRef, skuRef, layerName, appRate: manual?.appRate ?? (engine ? appRateOf(engine) : null) };
  }
  const editRow = (skuRef: string, row: OverrideRow) => setDialog(dialogFromRow(row, context(skuRef, row)));
  const openNew = (skuRef: string, kind: "replace" | "add", layerKey: string | null, layerName: string, appRate: string | null = null) => {
    const existing = layerKey ? rowsOf(skuRef).find((o) => o.layerKey === layerKey) : undefined;
    if (existing) return editRow(skuRef, existing);
    setDialog(overrideDialog({ scenarioRef, skuRef, ref: newRef(), kind, layerKey, layerName, appRate }));
  };
  const byId = (overrideId: string) => findOverride(draft, scenarioRef, overrideId);

  const editing: ManualEditing = {
    onOverride: (skuRef, layer) => openNew(skuRef, "replace", layer.layerKey, layer.label, appRateOf(layer)),
    onApplyManually: (skuRef, program) => openNew(skuRef, "add", program.programKey, program.name),
    onAddDuty: (skuRef) => openNew(skuRef, "add", null, ""),
    onEdit: (skuRef, id) => {
      const found = byId(id);
      if (found) editRow(found.skuRef, found.row);
    },
    onRemove: (skuRef, id) => {
      const found = byId(id);
      if (found) update((d) => removeOverride(d, scenarioRef, found.skuRef, found.row.ref));
    },
    onKeepMyRate: (skuRef, id) => {
      const found = byId(id);
      if (found) update((d) => keepMyRate(d, scenarioRef, found.skuRef, found.row.ref));
    },
    onConflict: setConflictId,
    rowForLayer: (skuRef, layerKey) => {
      const row = rowsOf(skuRef).find((o) => o.kind === "replace" && o.layerKey === layerKey);
      return row ? { ref: row.ref, unsaved: isUnsaved(row, saved, scenarioRef, skuRef) } : null;
    },
    isUnsaved: (skuRef, id) => {
      const found = byId(id);
      return !found || isUnsaved(found.row, saved, scenarioRef, found.skuRef);
    },
  };

  // The conflict being resolved, with its draft row.
  const conflict = conflictId
    ? skus.flatMap((s) => s.conflicts.map((c) => ({ ...c, skuRef: s.skuLineId }))).find((c) => c.overrideId === conflictId)
    : undefined;
  const conflictRow = conflict ? byId(conflict.overrideId) : null;
  function resolve(action: "remove" | "keep") {
    if (!conflict || !conflictRow) return setConflictId(null);
    const { skuRef, row } = conflictRow;
    if (action === "remove") update((d) => removeOverride(d, scenarioRef, skuRef, row.ref));
    else {
      const base = dialogFromRow(row, context(skuRef, row));
      if (conflict.code === "no_longer_matches") setDialog(asManualDuty({ ...base, layerName: conflict.layerName }));
      else {
        const engine = resultOf(skuRef)?.layers.find((l) => l.layerKey === row.layerKey && !l.manual);
        setDialog(asOverride({ ...base, layerName: engine?.label ?? base.layerName }, engine ? appRateOf(engine) : null));
      }
    }
    setConflictId(null);
  }

  const where = dialog ? `${skuOf(dialog.skuRef)?.skuCode || "This SKU"} in ${scenario?.label || "this origin"}` : "";
  const isNew = dialog ? !rowsOf(dialog.skuRef).some((o) => o.ref === dialog.ref) : false;
  const dialogs = (
    <>
      <ManualRateDialogView
        dialog={dialog}
        draft={draft}
        where={where}
        isNew={isNew}
        onChange={setDialog}
        onApply={(d) => {
          update((x) => upsertOverride(x, d));
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
      <Dialog open={conflict != null} onOpenChange={(open) => !open && setConflictId(null)}>
        <DialogContent>
          {conflict && (
            <>
              <DialogHeader>
                <DialogTitle>Fix this manual rate</DialogTitle>
                <DialogDescription>
                  {skuOf(conflict.skuRef)?.skuCode ?? "This SKU"} in {scenario?.label}: {conflict.message} Nothing is saved until you save the draft.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => resolve("remove")}>
                  Remove
                </Button>
                <Button type="button" onClick={() => resolve("keep")} disabled={!conflictRow}>
                  {conflict.code === "no_longer_matches" ? "Keep as a manual duty" : "Keep my rate as an override"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    editing,
    dialogs,
    editRow: (skuRef: string, ref: string) => {
      const row = rowsOf(skuRef).find((o) => o.ref === ref);
      if (row) editRow(skuRef, row);
    },
    removeRow: (skuRef: string, ref: string) => update((d) => removeOverride(d, scenarioRef, skuRef, ref)),
    keepRow: (skuRef: string, ref: string) => update((d) => keepMyRate(d, scenarioRef, skuRef, ref)),
    resolveConflict: setConflictId,
  };
}
