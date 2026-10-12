"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectPanel } from "@/components/client-portal/project-panel";
import type { FormDefaults, Partner } from "@/lib/client-updates/prefill";
import { MAX_MILESTONES, MAX_REASONS, MAX_TRADE_OFFS } from "@/lib/client-updates/publish-inputs";
import type { ClientUpdateView } from "@/lib/client-updates/portal-text";
import type { ShareKind } from "@/lib/client-updates/share-paths";
import { CLIENT_STAGES } from "@/lib/client-updates/stages";
import { PUBLISH_CONFIRM } from "@/lib/client-updates/share-text";
import {
  discardClientUpdateDraft,
  previewClientUpdate,
  publishClientUpdate,
  saveClientUpdateDraft,
} from "./actions";

// The Publish form. Native inputs throughout (they're prefilled from the
// server). Preview asks the server to build exactly what the client will
// see; any edit afterwards makes the preview out of date, and Publish only
// works on a current preview (the server checks the fingerprint again).

const field =
  "w-full min-w-0 rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const label = "text-sm font-medium text-move-navy";
const hint = "text-xs text-neutral-muted";

export function ShareForm({
  kind,
  projectId,
  clientName,
  partners,
  defaults,
  hasDraft,
  prefilledFrom,
  today,
}: {
  kind: ShareKind;
  projectId: string;
  clientName: string;
  partners: Partner[];
  defaults: FormDefaults;
  hasDraft: boolean;
  prefilledFrom: "draft" | "published" | null;
  today: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ view: ClientUpdateView; hash: string; current: boolean } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const milestoneRows = Math.min(MAX_MILESTONES, Math.max(3, defaults.milestones.length + 1));

  function formData() {
    return new FormData(formRef.current!);
  }

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(action);
  }

  function onPreview() {
    run(async () => {
      const result = await previewClientUpdate(kind, projectId, formData());
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setPreview({ ...result, current: true });
    });
  }

  function onSaveDraft() {
    run(async () => {
      const result = await saveClientUpdateDraft(kind, projectId, formData());
      setMessage("error" in result ? { tone: "error", text: result.error } : { tone: "ok", text: result.ok });
    });
  }

  function onPublish() {
    if (!preview?.current) return;
    run(async () => {
      const result = await publishClientUpdate(kind, projectId, preview.hash, formData());
      setConfirming(false);
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
        setPreview((p) => (p ? { ...p, current: false } : p));
        return;
      }
      setMessage({ tone: "ok", text: result.ok });
      setPreview(null);
    });
  }

  function onDiscard() {
    run(async () => {
      const result = await discardClientUpdateDraft(kind, projectId);
      setMessage("error" in result ? { tone: "error", text: result.error } : { tone: "ok", text: result.ok });
    });
  }

  const forwarder = kind === "forwarder";
  const sections: { key: keyof FormDefaults["sections"]; text: string }[] = [
    { key: "funnel", text: "Partner search progress (counts only)" },
    { key: "cost", text: forwarder ? "Freight cost per shipment" : "Rate card vs. today (percent only, never amounts)" },
    ...(forwarder
      ? [
          { key: "fcr" as const, text: "Freight Cost Ratio" },
          { key: "leadTime" as const, text: "Transit time" },
          { key: "validity" as const, text: "Quote validity" },
        ]
      : []),
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        onChange={() => setPreview((p) => (p && p.current ? { ...p, current: false } : p))}
        className="flex min-w-0 flex-col gap-6"
      >
        {prefilledFrom && (
          <p className={hint}>
            {prefilledFrom === "draft" ? "Continuing your saved draft." : "Prefilled from the last published update."}
          </p>
        )}

        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-2 font-display text-base font-semibold text-move-navy">Where things stand</legend>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="share-stage" className={label}>
              Stage
            </label>
            <select id="share-stage" name="stage" required defaultValue={defaults.stage ?? ""} className={field}>
              <option value="" disabled>
                Choose the stage the client should see
              </option>
              {CLIENT_STAGES.map((s) => (
                <option key={s.stage} value={s.stage}>
                  {s.stage}. {s.label}
                </option>
              ))}
            </select>
            <p className={hint}>You choose it: it isn&apos;t worked out from partner statuses.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="share-headline" className={label}>
              Headline
            </label>
            <input id="share-headline" name="headline" required maxLength={120} defaultValue={defaults.headline} className={field} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="share-summary" className={label}>
              Where we are
            </label>
            <textarea
              id="share-summary"
              name="summary"
              required
              maxLength={1200}
              rows={5}
              defaultValue={defaults.summary}
              className={field}
            />
            <p className={hint}>3–5 plain sentences. This is what stops charts being misread.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="share-next" className={label}>
                Next step
              </label>
              <input id="share-next" name="nextStep" maxLength={200} defaultValue={defaults.nextStep ?? ""} className={field} />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="share-due" className={label}>
                Due
              </label>
              <input id="share-due" name="nextStepDue" type="date" defaultValue={defaults.nextStepDue ?? ""} className={field} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-move-navy">
            <input type="checkbox" name="needsClientAction" defaultChecked={defaults.needsClientAction} className="size-4" />
            The client needs to do something (shows &ldquo;Needs your input&rdquo;)
          </label>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-2 font-display text-base font-semibold text-move-navy">Milestones</legend>
          <p className={hint}>Planned and actual dates. Leave a row empty to skip it.</p>
          {Array.from({ length: milestoneRows }, (_, i) => {
            const m = defaults.milestones[i];
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <input
                  aria-label={`Milestone ${i + 1} name`}
                  name={`milestone_label_${i}`}
                  maxLength={60}
                  placeholder="e.g. Quotes due"
                  defaultValue={m?.label ?? ""}
                  className={field}
                />
                <input aria-label={`Milestone ${i + 1} planned date`} name={`milestone_planned_${i}`} type="date" defaultValue={m?.planned ?? ""} className={field} />
                <input aria-label={`Milestone ${i + 1} actual date`} name={`milestone_actual_${i}`} type="date" defaultValue={m?.actual ?? ""} className={field} />
              </div>
            );
          })}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-2 font-display text-base font-semibold text-move-navy">Partners to name</legend>
          {partners.length === 0 ? (
            <p className="text-sm text-move-navy">
              Nobody is shortlisted yet, so no partner is named: the client sees counts only.
            </p>
          ) : (
            <>
              <p className={hint}>Only shortlisted partners can be named. Everyone else appears only in the counts.</p>
              {partners.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-move-navy">
                  <input type="checkbox" name="partnerIds" value={p.id} defaultChecked={defaults.partnerIds.includes(p.id)} className="size-4" />
                  {p.name}
                </label>
              ))}
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="share-recommended" className={label}>
                  Move recommends
                </label>
                <select id="share-recommended" name="recommendedId" defaultValue={defaults.recommendedId ?? ""} className={field}>
                  <option value="">No recommendation yet</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <span className={label}>Why (up to {MAX_REASONS})</span>
            {Array.from({ length: MAX_REASONS }, (_, i) => (
              <input key={i} aria-label={`Reason ${i + 1}`} name={`reason_${i}`} maxLength={140} defaultValue={defaults.reasons[i] ?? ""} className={field} />
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className={label}>Trade-offs (up to {MAX_TRADE_OFFS})</span>
            {Array.from({ length: MAX_TRADE_OFFS }, (_, i) => (
              <input key={i} aria-label={`Trade-off ${i + 1}`} name={`tradeOff_${i}`} maxLength={140} defaultValue={defaults.tradeOffs[i] ?? ""} className={field} />
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="share-based-on" className={label}>
              Based on
            </label>
            <input id="share-based-on" name="basedOn" maxLength={120} placeholder="e.g. You told us cost matters most." defaultValue={defaults.basedOn ?? ""} className={field} />
          </div>
          <p className={hint}>Write these for the client. Nothing is copied from internal notes or assessments.</p>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 font-display text-base font-semibold text-move-navy">Charts to include</legend>
          {sections.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm text-move-navy">
              <input type="checkbox" name={`section_${s.key}`} defaultChecked={defaults.sections[s.key]} className="size-4" />
              {s.text}
            </label>
          ))}
          {forwarder && (
            <label className="mt-2 flex items-start gap-2 text-sm text-move-navy">
              <input type="checkbox" name="includeAnnual" defaultChecked={defaults.includeAnnual} className="mt-0.5 size-4" />
              <span>
                Include annual estimate
                <span className={`block ${hint}`}>Annual savings stay internal unless you tick this.</span>
              </span>
            </label>
          )}
          <p className={hint}>Charts only appear when there&apos;s enough data; otherwise the client sees a short explanation.</p>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="share-contact" className={label}>
            Contact email (optional)
          </label>
          <input
            id="share-contact"
            name="contactEmail"
            type="email"
            maxLength={254}
            autoComplete="off"
            defaultValue={defaults.contactEmail ?? ""}
            className={field}
          />
          <p className={hint}>
            Shown to the client next to the project owner&apos;s first name. A shared Move address is fine instead of a
            personal one. If it&apos;s empty, the client sees the first name only.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onPreview} disabled={isPending}>
            {preview && !preview.current ? "Preview again" : "Preview"}
          </Button>
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={isPending}>
            Save draft
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={isPending || !preview?.current}>
            Publish…
          </Button>
          {hasDraft && (
            <Button type="button" variant="ghost" onClick={onDiscard} disabled={isPending}>
              Discard draft
            </Button>
          )}
        </div>
        {!preview?.current && <p className={hint}>Preview first: you can only publish what you&apos;ve previewed.</p>}
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-move-navy"}`}>
            {message.text}
          </p>
        )}
      </form>

      <div className="min-w-0">
        <h2 className="mb-1 font-display text-base font-semibold text-move-navy">Preview: exactly what {clientName} will see</h2>
        {preview ? (
          <div className="flex flex-col gap-2">
            {!preview.current && (
              <p role="status" className="rounded-lg border border-portal-amber bg-portal-amber-bg px-3 py-2 text-sm text-portal-amber">
                Out of date: you&apos;ve changed the form since this preview. Preview again before publishing.
              </p>
            )}
            <ProjectPanel update={preview.view} today={today} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-border p-6 text-sm text-neutral-muted">
            Press Preview to see the update as the client will.
          </p>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this update for {clientName}?</DialogTitle>
            <DialogDescription>{PUBLISH_CONFIRM}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={onPublish} disabled={isPending}>
              {isPending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
