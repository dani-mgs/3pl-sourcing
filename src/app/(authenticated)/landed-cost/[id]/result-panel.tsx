"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { COVERED_TEXT, type DutyLayer, type ProgramNote, type ResultView, type SkuResultRow } from "@/lib/landed-cost/result-view";
import { IncompleteEstimateBadge } from "@/components/tariff/incomplete-estimate-badge";
import { cardClass, linkButtonClass, secondaryButtonClass } from "../styles";
import { IncludesManualRate, ManualLayerDetails, ManualMark, NotSavedMark } from "./manual-layer";

// The result of the LAST SAVE, calculated on the server (toResultView). A
// scenario shows totals only when it's complete; otherwise it lists what's
// missing, each item focusing its field. Every status is a word with an
// icon; colour only repeats it. Manual rates are shown in full to everyone;
// `editing` (the workspace's owner or an admin, never a locked version) adds
// the buttons that change them in the local draft.

// What the panel's manual-rate buttons do (workspace-editor.tsx), and the
// draft's state for the marks. SKU line ids are the saved SKUs' refs.
export type ManualEditing = {
  onOverride: (skuLineId: string, layer: DutyLayer) => void;
  onApplyManually: (skuLineId: string, program: ProgramNote) => void;
  onAddDuty: (skuLineId: string) => void;
  onEdit: (skuLineId: string, overrideId: string) => void;
  onRemove: (skuLineId: string, overrideId: string) => void;
  onKeepMyRate: (skuLineId: string, overrideId: string) => void;
  onConflict: (overrideId: string) => void;
  // The draft's manual rate for an app layer, if any.
  rowForLayer: (skuLineId: string, layerKey: string) => { ref: string; unsaved: boolean } | null;
  // A saved manual rate changed or removed in the draft since.
  isUnsaved: (skuLineId: string, overrideId: string) => boolean;
};

const WARNING_BOX = "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]";

function focusField(id: string | null) {
  if (!id) return;
  const element = document.getElementById(id);
  element?.scrollIntoView({ block: "center" });
  element?.focus();
}

function Status({ kind, children }: { kind: "complete" | "incomplete" | "error"; children: ReactNode }) {
  const Icon = kind === "complete" ? CheckCircle2 : kind === "incomplete" ? AlertTriangle : CircleAlert;
  const tone = kind === "complete" ? "text-[#15803D]" : kind === "incomplete" ? "text-[#92400E]" : "text-danger";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error"; children: ReactNode }) {
  const Icon = tone === "info" ? Info : tone === "warning" ? AlertTriangle : CircleAlert;
  const box = tone === "info" ? "rounded-xl bg-neutral-bg px-4 py-3 text-sm text-move-navy" : tone === "warning" ? WARNING_BOX : "rounded-xl border border-danger/40 bg-[#FDE8E8] px-4 py-3 text-sm text-[#991B1B]";
  return (
    <div className={`${box} flex items-start gap-2`} role={tone === "info" ? "status" : "alert"}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function LayerActions({ sku, layer, editing }: { sku: SkuResultRow; layer: DutyLayer; editing: ManualEditing }) {
  if (layer.manual) {
    const id = layer.manual.overrideId;
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {editing.isUnsaved(sku.skuLineId, id) && <NotSavedMark />}
        <button type="button" className={linkButtonClass} onClick={() => editing.onEdit(sku.skuLineId, id)}>
          Edit<span className="sr-only"> the manual rate for {layer.manual.layerName}</span>
        </button>
        {layer.manual.note ? (
          <>
            <button type="button" className={linkButtonClass} onClick={() => editing.onRemove(sku.skuLineId, id)}>
              Remove (use the app&apos;s rate)
            </button>
            <button type="button" className={linkButtonClass} onClick={() => editing.onKeepMyRate(sku.skuLineId, id)}>
              Keep my rate
            </button>
          </>
        ) : (
          <button type="button" className={linkButtonClass} onClick={() => editing.onRemove(sku.skuLineId, id)}>
            Remove
          </button>
        )}
      </p>
    );
  }
  if (!layer.layerKey) return null;
  const row = editing.rowForLayer(sku.skuLineId, layer.layerKey);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3">
      {row?.unsaved && <NotSavedMark />}
      <button type="button" className={linkButtonClass} onClick={() => editing.onOverride(sku.skuLineId, layer)}>
        {row ? "Edit manual rate" : "Override"}
        <span className="sr-only"> {layer.label}</span>
      </button>
    </p>
  );
}

function ProgramsNotCounted({ sku, editing }: { sku: SkuResultRow; editing: ManualEditing | null }) {
  if (sku.programs.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-medium tracking-wide text-neutral-muted uppercase">Programs not counted</p>
      <ul className="mt-1 flex flex-col gap-1">
        {sku.programs.map((p) => (
          <li key={p.programKey}>
            <span className="font-medium text-move-navy">{p.name}</span>: {p.text}
            {p.covered ? (
              <span className="font-medium text-move-navy"> {COVERED_TEXT}</span>
            ) : (
              editing && (
                <>
                  {" "}
                  <button type="button" className={linkButtonClass} onClick={() => editing.onApplyManually(sku.skuLineId, p)}>
                    Apply manually<span className="sr-only"> ({p.name})</span>
                  </button>
                </>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkuDuties({ sku, editing }: { sku: SkuResultRow; editing: ManualEditing | null }) {
  if (sku.status === "duty_error") {
    return (
      <p className="text-xs text-danger">
        {sku.message} <span className="text-neutral-muted">Check the HTS code.</span>
      </p>
    );
  }
  if (sku.layers.length === 0 && sku.programs.length === 0 && !editing) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-move-green">
        Duty layers<span className="sr-only"> for {sku.skuCode}</span>
      </summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="text-[10px] tracking-wide text-neutral-muted uppercase">
            <th scope="col" className="py-1 pr-2 font-medium">Layer</th>
            <th scope="col" className="py-1 pr-2 font-medium">Rate</th>
            <th scope="col" className="py-1 text-right font-medium">USD</th>
          </tr>
        </thead>
        <tbody>
          {sku.layers.map((l) => (
            <tr key={`${l.label}-${l.heading ?? ""}`} className="border-t border-neutral-border align-top">
              <td className="py-1.5 pr-2">
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-move-navy">
                  {l.label}
                  {l.manual && <ManualMark />}
                </p>
                {l.manual && <ManualLayerDetails manual={l.manual} />}
                {l.heading && <p className="text-neutral-muted">Chapter 99 heading {l.heading}</p>}
                {l.detail && <p className="text-neutral-muted">{l.detail}</p>}
                <p className="text-neutral-muted">
                  Source:{" "}
                  <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-move-green hover:underline">
                    {l.sourceLabel}
                  </a>
                  {l.checkedOn && <> · source checked {l.checkedOn}</>}
                </p>
                {l.notes.map((n) => (
                  <p key={n} className="text-[#92400E]">
                    {n}
                  </p>
                ))}
                {editing && <LayerActions sku={sku} layer={l} editing={editing} />}
              </td>
              <td className="py-1.5 pr-2 whitespace-nowrap">{l.rate}</td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sku.lastVerified && (
        <p className={sku.lastVerifiedStale ? "mt-1 font-medium text-[#92400E]" : "mt-1 text-neutral-muted"}>
          {sku.lastVerified}
          {sku.lastVerifiedStale && " (over 30 days ago; ask a tariff editor to review it)"}
        </p>
      )}
      <ProgramsNotCounted sku={sku} editing={editing} />
      {editing && (
        <button type="button" className={`${linkButtonClass} mt-2`} onClick={() => editing.onAddDuty(sku.skuLineId)}>
          Add manual duty<span className="sr-only"> for {sku.skuCode}</span>
        </button>
      )}
    </details>
  );
}

function SkuTable({ skus, complete, editing }: { skus: SkuResultRow[]; complete: boolean; editing: ManualEditing | null }) {
  return (
    <table className="w-full text-left text-sm text-move-navy">
      <caption className="sr-only">Per SKU</caption>
      <thead>
        <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
          <th scope="col" className="py-2 pr-2 font-medium">SKU</th>
          {complete && <th scope="col" className="py-2 pr-2 text-right font-medium">Per unit</th>}
          <th scope="col" className="py-2 text-right font-medium">Duties</th>
        </tr>
      </thead>
      <tbody>
        {skus.map((s) => (
          <tr key={s.skuLineId} className="border-b border-neutral-border align-top last:border-0">
            <td className="py-2 pr-2">
              <p className="font-medium">{s.skuCode}</p>
              <p className="text-xs text-neutral-muted">HTS {s.htsCode}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Status kind={s.status === "ok" ? "complete" : s.status === "duty_error" ? "error" : "incomplete"}>{s.statusLabel}</Status>
                {s.dutiesIncomplete && <IncompleteEstimateBadge />}
                {s.includesManualRate && <IncludesManualRate />}
              </div>
              <div className="mt-1">
                <SkuDuties sku={s} editing={editing} />
              </div>
            </td>
            {complete && <td className="py-2 pr-2 text-right whitespace-nowrap tabular-nums">{s.perUnit}</td>}
            <td className="py-2 text-right whitespace-nowrap tabular-nums">
              {s.duties ?? "—"}
              {s.dutyRate && <p className="text-xs text-neutral-muted">{s.dutyRate}</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className={WARNING_BOX} role="note">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4" />
        Warnings
      </p>
      <ul className="mt-1 flex flex-col gap-1 text-xs">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function Body({ view, editing }: { view: ResultView; editing: ManualEditing | null }) {
  switch (view.state) {
    case "complete":
      return (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Status kind="complete">Complete</Status>
              {view.incomplete && <IncompleteEstimateBadge />}
              {view.includesManualRate && <IncludesManualRate />}
            </div>
            <p className="text-xs text-neutral-muted">Landed cost per unit</p>
            <p className="font-display text-4xl font-semibold text-move-navy tabular-nums" data-testid="lc-per-unit">
              {view.perUnit}
              <span className="ml-1 text-sm font-normal text-neutral-muted">USD / pc</span>
            </p>
            <p className="text-sm text-move-navy tabular-nums">
              Shipment total <span className="font-semibold">{view.total}</span> · {view.units}
            </p>
          </div>
          <table className="w-full text-left text-sm text-move-navy">
            <caption className="sr-only">Breakdown</caption>
            <thead>
              <tr className="border-b border-neutral-border text-xs tracking-wide text-neutral-muted uppercase">
                <th scope="col" className="py-2 pr-2 font-medium">Part</th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">Per unit</th>
                <th scope="col" className="py-2 pr-2 text-right font-medium">USD</th>
                <th scope="col" className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {view.breakdown.map((r) => (
                <tr key={r.key} className="border-b border-neutral-border last:border-0">
                  <th scope="row" className="py-1.5 pr-2 font-normal">{r.label}</th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.perUnit}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.amount}</td>
                  <td className="py-1.5 text-right text-neutral-muted tabular-nums">{r.share}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.percentagesRounded && <p className="-mt-2 text-xs text-neutral-muted">Percentages are rounded.</p>}
          <SkuTable skus={view.skus} complete editing={editing} />
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-muted uppercase">Fees</p>
            <ul className="flex flex-col gap-1 text-xs text-move-navy">
              {view.feeNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <Warnings warnings={view.warnings} />
        </>
      );
    case "incomplete":
      return (
        <>
          <Status kind="incomplete">Incomplete: no total yet</Status>
          <Notice tone="warning">
            <p className="font-semibold">Enter these, then save, to see the landed cost:</p>
            <ul className="flex flex-col gap-1">
              {view.missing.map((m) => (
                <li key={`${m.label}-${m.targetId}`}>
                  {m.conflict && editing ? (
                    <button type="button" onClick={() => editing.onConflict(m.conflict!.overrideId)} className="text-left underline underline-offset-2 hover:no-underline">
                      {m.label}
                    </button>
                  ) : m.targetId ? (
                    <button type="button" onClick={() => focusField(m.targetId)} className="text-left underline underline-offset-2 hover:no-underline">
                      {m.label}
                    </button>
                  ) : (
                    m.label
                  )}
                </li>
              ))}
            </ul>
          </Notice>
          <SkuTable skus={view.skus} complete={false} editing={editing} />
          <Warnings warnings={view.warnings} />
        </>
      );
    case "error":
      return (
        <>
          <Status kind="error">Can&apos;t be calculated</Status>
          <Notice tone="error">
            <p>{view.message}</p>
          </Notice>
          <SkuTable skus={view.skus} complete={false} editing={editing} />
        </>
      );
    case "duties_unavailable":
      return (
        <Notice tone="error">
          <p>{view.message}</p>
          <p className="text-xs">Your inputs are saved; reload the page to try again.</p>
        </Notice>
      );
    case "no_sku_lines":
      return (
        <Notice>
          <p>Add at least one SKU, then save, to see the landed cost.</p>
        </Notice>
      );
    case "no_scenario":
      return (
        <Notice tone="error">
          <p>This workspace has no scenario, so it can&apos;t be calculated.</p>
        </Notice>
      );
    case "entry_date_out_of_range":
      return (
        <Notice tone="warning">
          <p className="font-semibold">Update the entry date</p>
          <p>{view.message}</p>
          <p>
            Choose a date from {view.min} to {view.max}, then save.
          </p>
          <button type="button" onClick={() => focusField(view.targetId)} className={`${secondaryButtonClass} self-start`}>
            Change the entry date
          </button>
        </Notice>
      );
  }
}

// `view` is null for an origin added since the last save; `originLabel`
// names the origin when the workspace has several.
export function ResultPanel({
  view,
  dirty,
  lastSaved,
  originLabel = null,
  subtitle = null,
  editing = null,
}: {
  view: ResultView | null;
  dirty: boolean;
  lastSaved: string;
  originLabel?: string | null;
  // In place of "As of your last save…" (a locked version).
  subtitle?: string | null;
  // Null: read-only (not the owner or an admin, or a locked version).
  editing?: ManualEditing | null;
}) {
  return (
    <section className={`${cardClass} flex flex-col gap-4`} aria-labelledby="lc-result-title" aria-live="polite">
      <div>
        <h2 id="lc-result-title" className="font-display text-lg font-semibold text-move-navy">
          Result{originLabel && <span className="font-normal text-neutral-muted"> · {originLabel}</span>}
        </h2>
        <p className="text-xs text-neutral-muted">{subtitle ?? `As of your last save (${lastSaved}), calculated on the server.`}</p>
        {dirty && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#92400E]">
            <AlertTriangle aria-hidden="true" className="size-3.5" /> Unsaved changes: save to update the result.
          </p>
        )}
      </div>
      {view ? (
        <Body view={view} editing={editing} />
      ) : (
        <Notice>
          <p>Not calculated yet: save to see this origin&apos;s result.</p>
        </Notice>
      )}
    </section>
  );
}
