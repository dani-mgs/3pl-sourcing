"use client";

import { useState, type KeyboardEvent } from "react";
import { Copy, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorDraft } from "@/lib/landed-cost/editor-draft";
import { MAX_ORIGINS_REASON, addBlankOrigin, canAddOrigin, duplicateOrigin, removeOrigin, setBaseline } from "@/lib/landed-cost/origin-draft";
import { fieldClass, hintClass, labelClass, secondaryButtonClass } from "../styles";
import type { Countries } from "./shipment-section";

type Update = (change: (draft: EditorDraft) => EditorDraft) => void;

// Adding an origin: by duplicating the selected one or blank. Both ask for
// the country first (no default); the label follows it, never a duplicate.
export function AddOriginButtons({
  draft,
  sourceRef,
  countries,
  disabled,
  update,
  newRef,
  onAdded,
}: {
  draft: EditorDraft;
  sourceRef: string;
  countries: Countries;
  disabled: boolean;
  update: Update;
  newRef: () => string;
  onAdded: (ref: string) => void;
}) {
  const [kind, setKind] = useState<"duplicate" | "blank" | null>(null);
  const [country, setCountry] = useState("");
  const full = !canAddOrigin(draft);
  const source = draft.scenarios.find((s) => s.ref === sourceRef);

  function confirm() {
    const chosen = countries.find((c) => c.code === country);
    if (!chosen || !kind) return;
    const ref = newRef();
    const origin = { ref, countryCode: chosen.code, countryName: chosen.name };
    update((d) => (kind === "duplicate" ? duplicateOrigin(d, sourceRef, origin, newRef) : addBlankOrigin(d, origin)));
    setKind(null);
    onAdded(ref);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} disabled={disabled || full} onClick={() => { setCountry(""); setKind("duplicate"); }}>
          <Copy aria-hidden="true" className="size-4" /> Duplicate this origin
        </button>
        <button type="button" className={secondaryButtonClass} disabled={disabled || full} onClick={() => { setCountry(""); setKind("blank"); }}>
          <Plus aria-hidden="true" className="size-4" /> Add blank origin
        </button>
      </div>
      {full && <p className={hintClass}>{MAX_ORIGINS_REASON}</p>}
      <Dialog open={kind != null} onOpenChange={(open) => !open && setKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === "duplicate" ? "Duplicate this origin" : "Add blank origin"}</DialogTitle>
            <DialogDescription>
              {kind === "duplicate"
                ? `Copies ${source?.label ?? "this origin"}'s mode, incoterm, entry type, freight split, divisor, packing and other costs. FOB prices and the freight total start empty: enter them for the new origin.`
                : "Starts empty (Sea, FOB, automatic entry): enter its prices, packing and freight."}{" "}
              Nothing is saved until you save the draft.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="lc-new-origin-country" className={labelClass}>
              Country of origin
            </label>
            <select id="lc-new-origin-country" value={country} onChange={(e) => setCountry(e.target.value)} className={fieldClass} required>
              <option value="" disabled>
                Choose a country
              </option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKind(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={country === ""}>
              Add origin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// One tab per origin (label and country), the baseline marked in words.
// Arrow keys move between tabs.
export function OriginTabs({
  draft,
  selectedRef,
  onSelect,
  countries,
  panelId,
}: {
  draft: EditorDraft;
  selectedRef: string;
  onSelect: (ref: string) => void;
  countries: Countries;
  panelId: string;
}) {
  const name = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = draft.scenarios[(index + step + draft.scenarios.length) % draft.scenarios.length];
    onSelect(next.ref);
    requestAnimationFrame(() => document.getElementById(`lc-tab-${next.ref}`)?.focus());
  }
  return (
    <div role="tablist" aria-label="Origins" className="flex flex-wrap gap-2 border-b border-neutral-border">
      {draft.scenarios.map((s, index) => {
        const selected = s.ref === selectedRef;
        return (
          <button
            key={s.ref}
            id={`lc-tab-${s.ref}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(s.ref)}
            onKeyDown={(e) => onKey(e, index)}
            className={`-mb-px rounded-t-xl border px-4 py-2.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none ${
              selected ? "border-neutral-border border-b-white bg-white font-semibold text-move-navy" : "border-transparent text-neutral-muted hover:text-move-navy"
            }`}
          >
            <span className="block">{s.label || "Unnamed origin"}</span>
            <span className="block text-xs font-normal">
              {name(s.originCountry)}
              {s.ref === draft.baselineRef && <> · Baseline</>}
              {s.id == null && <> · not saved yet</>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Baseline and remove, for the selected origin. Never the last origin;
// removing the baseline makes the first remaining one the baseline.
export function OriginActions({
  draft,
  selectedRef,
  disabled,
  update,
  onRemoved,
}: {
  draft: EditorDraft;
  selectedRef: string;
  disabled: boolean;
  update: Update;
  onRemoved: (next: { selectRef: string; newBaselineLabel: string | null }) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const selected = draft.scenarios.find((s) => s.ref === selectedRef);
  if (!selected) return null;
  const isBaseline = selected.ref === draft.baselineRef;
  const last = draft.scenarios.length <= 1;

  function remove() {
    const { draft: next, newBaseline } = removeOrigin(draft, selectedRef);
    update(() => next);
    setConfirming(false);
    onRemoved({
      selectRef: newBaseline ?? next.baselineRef,
      newBaselineLabel: newBaseline ? (next.scenarios.find((s) => s.ref === newBaseline)?.label ?? null) : null,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isBaseline ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-move-navy">
          <Star aria-hidden="true" className="size-4" /> Baseline
        </span>
      ) : (
        <button type="button" className={secondaryButtonClass} disabled={disabled} onClick={() => update((d) => setBaseline(d, selectedRef))}>
          <Star aria-hidden="true" className="size-4" /> Set as baseline
        </button>
      )}
      <button type="button" className={secondaryButtonClass} disabled={disabled || last} onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden="true" className="size-4" /> Remove origin
      </button>
      {last && <p className={hintClass}>A workspace needs at least one origin.</p>}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove origin</DialogTitle>
            <DialogDescription>
              Remove {selected.label || "this origin"} with its prices, packing, freight and other costs?
              {isBaseline && " It's the baseline: the first remaining origin becomes the baseline."} Nothing is saved until you save the draft.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
