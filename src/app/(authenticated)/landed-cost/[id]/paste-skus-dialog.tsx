"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorDraft } from "@/lib/landed-cost/editor-draft";
import { FIXED_ORDER, PASTE_FIELD_LABELS, parseSkuPaste, type PasteField } from "@/lib/landed-cost/parse-sku-paste";
import { applySkuPaste, pasteNotice, previewSkuPaste, type PastePreview } from "@/lib/landed-cost/sku-paste";
import { errorTextClass, hintClass, labelClass, linkButtonClass } from "../styles";

type Update = (change: (draft: EditorDraft) => EditorDraft) => void;

const ACTION_LABELS = { update: "Update", add: "Add", error: "Error" } as const;
const ACCEPTED: [string, string][] = [
  ["SKU", "SKU, SKU code, Item code"],
  ["Description", "Description, Product description, Product name"],
  ["HTS code", "HTS, HTS code, HTSUS"],
  ["Quantity", "Quantity, Qty"],
  ["FOB per unit (USD)", "FOB Unit Cost (USD), FOB per unit, FOB price, Unit Cost (USD) (used when there's no FOB column)"],
  ["Pcs per carton", "Box Configuration (pcs/carton), Pcs per carton, Pcs/carton"],
  ["L / W / H (cm)", "L (cm), Length (cm), Carton length (cm), and the same for W and H"],
  ["Carton kg", "Total Weight / Master Carton (kg), Carton kg, Carton weight (kg)"],
];

// The preview: every pasted row with what will happen to it, in words.
export function PastePreviewTable({ preview }: { preview: PastePreview }) {
  const fields = preview.columns.map((c) => c.field);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-move-navy" role="status">
        {preview.updates} to update, {preview.adds} to add
        {preview.errorRows > 0 && `, ${preview.errorRows} with errors (skipped if you apply the valid rows)`}.
      </p>
      {preview.limitError && (
        <p className={errorTextClass} role="alert">
          {preview.limitError}
        </p>
      )}
      {preview.notes.map((note) => (
        <p key={note} className={hintClass}>
          {note}
        </p>
      ))}
      {preview.ignored.length > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-muted uppercase">Columns not imported</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-move-navy">
            {preview.ignored.map((c) => (
              <li key={`${c.heading}-${c.reason}`}>
                <span className="font-medium">{c.heading}</span>: {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="max-h-[50vh] overflow-auto rounded-xl border border-neutral-border">
        <table className="w-full text-left text-xs text-move-navy">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-neutral-border tracking-wide text-neutral-muted uppercase">
              <th scope="col" className="px-2 py-2 font-medium">Row</th>
              <th scope="col" className="px-2 py-2 font-medium">Result</th>
              {fields.map((f) => (
                <th key={f} scope="col" className="px-2 py-2 font-medium">
                  {PASTE_FIELD_LABELS[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.rowNumber} className="border-b border-neutral-border align-top last:border-0">
                <td className="px-2 py-2 tabular-nums">{r.rowNumber}</td>
                <td className="px-2 py-2">
                  <span className={`font-semibold ${r.action === "error" ? "text-danger" : ""}`}>{ACTION_LABELS[r.action]}</span>
                  {r.errors.map((e) => (
                    <span key={e} className={`${errorTextClass} block`}>
                      {e}
                    </span>
                  ))}
                  {r.stillNeeded.length > 0 && <span className="block text-[#92400E]">Still needed before saving: {r.stillNeeded.join(", ")}</span>}
                  {r.warnings.map((w) => (
                    <span key={w} className="block text-[#92400E]">
                      <AlertTriangle aria-hidden="true" className="mr-1 inline size-3" />
                      {w}
                    </span>
                  ))}
                </td>
                {fields.map((f: PasteField) => (
                  <td key={f} className="px-2 py-2 tabular-nums">
                    {r.values[f] || <span className="text-neutral-muted">{r.action === "update" ? "kept" : "—"}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// "Paste from Excel": paste, preview, then apply to the local draft. Shared
// fields go to every origin; FOB price and packing to `originRef` only.
export function PasteSkusButton({
  draft,
  originRef,
  disabled,
  update,
  newRef,
  onApplied,
}: {
  draft: EditorDraft;
  originRef: string;
  disabled: boolean;
  update: Update;
  newRef: () => string;
  onApplied: (notice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PastePreview | null>(null);
  const origin = draft.scenarios.find((s) => s.ref === originRef) ?? draft.scenarios[0];

  function start() {
    setText("");
    setError(null);
    setPreview(null);
    setOpen(true);
  }
  function showPreview() {
    const parsed = parseSkuPaste(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPreview(previewSkuPaste(draft, origin.ref, parsed));
  }
  function apply() {
    if (!preview) return;
    const result = applySkuPaste(draft, preview, newRef);
    update(() => result.draft);
    setOpen(false);
    onApplied(pasteNotice(preview.originLabel, result.updated, result.added));
  }

  const valid = preview ? preview.updates + preview.adds : 0;
  return (
    <>
      <button type="button" onClick={start} disabled={disabled} className={linkButtonClass}>
        <ClipboardPaste aria-hidden="true" className="mr-1 inline size-4" />
        Paste from Excel
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Paste from Excel</DialogTitle>
            <DialogDescription>
              Paste rows copied from Excel. SKU, description, HTS code and quantity are shared by every origin. FOB price and packing go to{" "}
              <strong>{origin.label}</strong>. A blank cell leaves a value as it is; nothing is deleted or saved until you save the draft.
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <PastePreviewTable preview={preview} />
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="lc-paste-text" className={labelClass}>
                Rows from Excel
              </label>
              <textarea
                id="lc-paste-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby="lc-paste-help"
                className="w-full rounded-xl border border-neutral-border bg-white p-3 font-mono text-xs text-move-navy focus:border-move-green focus:ring-2 focus:ring-move-green focus:outline-none aria-invalid:border-danger"
              />
              {error && (
                <p className={errorTextClass} role="alert">
                  {error}
                </p>
              )}
              <div id="lc-paste-help" className={hintClass}>
                <p>
                  With a header row, columns are matched by heading. Without one, paste them in this order:{" "}
                  {FIXED_ORDER.map((f) => PASTE_FIELD_LABELS[f]).join(", ")}. Calculated columns (totals, rates, fees, freight, landed cost) are never
                  imported. &quot;$&quot; and thousands commas are fine.
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer">Accepted headings (any case; &quot;(USD)&quot; at the end is optional)</summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {ACCEPTED.map(([field, names]) => (
                      <li key={field}>
                        <span className="font-medium">{field}</span>: {names}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {preview ? (
              <>
                <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                  Back to edit
                </Button>
                <Button type="button" onClick={apply} disabled={valid === 0 || preview.limitError != null}>
                  {preview.errorRows > 0 ? `Apply valid rows (${valid} of ${preview.rows.length})` : `Apply ${valid} ${valid === 1 ? "row" : "rows"}`}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={showPreview} disabled={text.trim() === ""}>
                Preview
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
