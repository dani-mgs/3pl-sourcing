"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorDraft } from "@/lib/landed-cost/editor-draft";
import {
  PREVIEW_NOTE,
  REASON_MAX,
  previewOf,
  validateDialog,
  type ManualRateDialog,
  type ValueType,
} from "@/lib/landed-cost/manual-rate-draft";
import { errorTextClass, fieldClass, hintClass, labelClass } from "../styles";

// Add, override or edit one manual rate in the local draft. Every rule saving
// checks is checked here first (validateDialog runs parse-draft's schema), so
// "Apply" is only possible for a manual rate the save would accept.

const TITLES = { replace: "Override a duty layer", add: "Add a manual duty" } as const;

export function ManualRateDialogView({
  dialog,
  draft,
  where,
  isNew,
  onChange,
  onApply,
  onClose,
}: {
  dialog: ManualRateDialog | null;
  draft: EditorDraft;
  // "SKU-001 in China".
  where: string;
  // Not in the draft yet (the title says what it adds).
  isNew: boolean;
  onChange: (next: ManualRateDialog) => void;
  onApply: (d: ManualRateDialog) => void;
  onClose: () => void;
}) {
  const errors = dialog ? validateDialog(dialog, draft) : {};
  const preview = dialog ? previewOf(dialog, draft) : { kind: "none" as const };
  const valid = Object.keys(errors).length === 0;
  const set = (patch: Partial<ManualRateDialog>) => dialog && onChange({ ...dialog, ...patch });
  // Errors show once there's something to check, not on an empty new form.
  const shown = (field: keyof typeof errors, value: string) => (value.trim() !== "" || field === "form" ? errors[field] : undefined);
  const free = dialog?.kind === "add" && dialog.layerKey === "";

  return (
    <Dialog open={dialog != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {dialog && (
          <>
            <DialogHeader>
              <DialogTitle>{isNew ? TITLES[dialog.kind] : "Edit manual rate"}</DialogTitle>
              <DialogDescription>
                {where}
                {!free && <> · {dialog.layerName}</>}
                {dialog.kind === "replace" && dialog.appRate && <> · App rate: {dialog.appRate}</>}
                . Nothing is saved until you save the draft.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {free && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="lc-manual-label" className={labelClass}>
                    Label
                  </label>
                  <input
                    id="lc-manual-label"
                    value={dialog.label}
                    onChange={(e) => set({ label: e.target.value })}
                    maxLength={100}
                    placeholder="e.g. Anti-dumping duty"
                    className={fieldClass}
                    aria-describedby={shown("label", dialog.label) ? "lc-manual-label-error" : undefined}
                  />
                  {shown("label", dialog.label) && (
                    <p id="lc-manual-label-error" className={errorTextClass}>
                      {errors.label}
                    </p>
                  )}
                </div>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className={`${labelClass} mb-2`}>Value</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(
                    [
                      ["rate", "% of goods value"],
                      ["amount", "Fixed USD amount"],
                    ] as [ValueType, string][]
                  ).map(([type, text]) => (
                    <label key={type} className="flex items-center gap-2 text-sm text-move-navy">
                      <input
                        type="radio"
                        name="lc-manual-value-type"
                        checked={dialog.valueType === type}
                        onChange={() => set({ valueType: type })}
                        className="accent-move-green"
                      />
                      {text}
                    </label>
                  ))}
                </div>
                <label htmlFor="lc-manual-value" className="sr-only">
                  {dialog.valueType === "rate" ? "Rate (% of goods value)" : "Amount (USD)"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="lc-manual-value"
                    value={dialog.value}
                    onChange={(e) => set({ value: e.target.value })}
                    inputMode="decimal"
                    placeholder={dialog.valueType === "rate" ? "e.g. 7.5" : "e.g. 150.00"}
                    className={`${fieldClass} max-w-48`}
                    aria-describedby="lc-manual-preview"
                  />
                  <span className="text-sm text-neutral-muted">{dialog.valueType === "rate" ? "%" : "USD"}</span>
                </div>
                {shown("value", dialog.value) && <p className={errorTextClass}>{errors.value}</p>}
                <p id="lc-manual-preview" className={hintClass} role="status">
                  {preview.kind === "amount" ? (
                    <>
                      <span className="font-medium text-move-navy">{preview.text}</span> for this SKU. {PREVIEW_NOTE}
                    </>
                  ) : preview.kind === "no_fob" ? (
                    preview.text
                  ) : (
                    PREVIEW_NOTE
                  )}
                </p>
              </fieldset>
              <div className="flex flex-col gap-2">
                <label htmlFor="lc-manual-reason" className={labelClass}>
                  Reason
                </label>
                <textarea
                  id="lc-manual-reason"
                  value={dialog.reason}
                  onChange={(e) => set({ reason: e.target.value })}
                  maxLength={REASON_MAX}
                  rows={3}
                  placeholder="e.g. CBP ruling NY N123456, or the broker's quote"
                  className={fieldClass}
                  aria-describedby="lc-manual-reason-count"
                />
                <p id="lc-manual-reason-count" className={hintClass}>
                  {dialog.reason.trim().length}/{REASON_MAX}
                </p>
                {shown("reason", dialog.reason) && <p className={errorTextClass}>{errors.reason}</p>}
              </div>
              {errors.form && (
                <p className={errorTextClass} role="alert">
                  {errors.form}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={() => onApply(dialog)} disabled={!valid}>
                Apply
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
