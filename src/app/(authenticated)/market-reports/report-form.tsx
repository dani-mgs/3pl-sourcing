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
import { MarketReportView } from "@/components/client-portal/market-report";
import { IDENTIFYING_TAKE_NOTE } from "@/lib/client-updates/market-report-inputs";
import {
  REGION_LABELS,
  REGIONS,
  SIZE_BANDS,
  SIZE_LABELS,
  TAKE_MAX,
  type MarketReportPayload,
} from "@/lib/client-updates/market-report-schema";
import { REPORT_PUBLISH_CONFIRM } from "@/lib/client-updates/share-text";
import { previewMarketReport, publishMarketReport } from "./actions";

// The Publish Market Report form. Native inputs throughout (prefilled from
// the server). Preview asks the server to build exactly what the client
// will see; any edit afterwards makes it out of date, and Publish only works
// on a current preview (the server checks the fingerprint again).

export type ReportFormRow = {
  id: string;
  name: string;
  shownAs: string;
  outcome: string;
  notTakenForward: boolean;
  size: string | null;
  region: string | null;
  take: string | null;
};

const field =
  "w-full min-w-0 rounded-lg border border-neutral-border bg-white px-2 py-1.5 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const hint = "text-xs text-neutral-muted";

export function ReportForm({
  projectId,
  clientName,
  shortlist,
  recommendedId,
  rows,
  prefilled,
}: {
  projectId: string;
  clientName: string;
  shortlist: { id: string; name: string }[];
  recommendedId: string | null;
  rows: ReportFormRow[];
  prefilled: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ payload: MarketReportPayload; hash: string; current: boolean } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onPreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await previewMarketReport(projectId, new FormData(formRef.current!));
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setPreview({ ...result, current: true });
    });
  }

  function onPublish() {
    if (!preview?.current) return;
    setMessage(null);
    startTransition(async () => {
      const result = await publishMarketReport(projectId, preview.hash, new FormData(formRef.current!));
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

  return (
    <div className="flex flex-col gap-8">
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        onChange={() => setPreview((p) => (p && p.current ? { ...p, current: false } : p))}
        className="flex min-w-0 flex-col gap-5"
      >
        {prefilled && <p className={hint}>Prefilled from the last published report.</p>}

        <div className="flex max-w-md flex-col gap-1">
          <label htmlFor="report-recommended" className="text-sm font-medium text-move-navy">
            Recommended forwarder
          </label>
          <select id="report-recommended" name="recommended" defaultValue={recommendedId ?? ""} className={field}>
            <option value="">None yet (all shortlisted)</option>
            {shortlist.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <p className={hint}>Only shortlisted forwarders can be recommended; they&apos;re the only ones named.</p>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 font-display text-base font-semibold text-move-navy">Forwarders in the report</legend>
          <p className="rounded-lg border border-portal-amber bg-portal-amber-bg px-3 py-2 text-sm text-portal-amber">
            {IDENTIFYING_TAKE_NOTE}
          </p>
          <p className={hint}>
            Size and region come from fixed lists (suggested from the forwarder&apos;s footprint and headquarters). The
            outcome follows the forwarder&apos;s status and quote; the preview shows the final one.
          </p>
          <div className="min-w-0 overflow-x-auto rounded-xl border border-neutral-border">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm text-move-navy">
              <thead className="bg-neutral-bg text-xs text-neutral-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Forwarder (internal)</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Shown as</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Outcome</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Size</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Region</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Move&apos;s take (optional)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-border align-top">
                    <th scope="row" className="px-3 py-2 font-medium">{r.name}</th>
                    <td className="px-3 py-2">{r.shownAs}</td>
                    <td className="px-3 py-2">{r.outcome}</td>
                    <td className="px-3 py-2">
                      <select name={`size:${r.id}`} defaultValue={r.size ?? ""} aria-label={`Size of ${r.name}`} className={field}>
                        <option value="">Not shown</option>
                        {SIZE_BANDS.map((s) => (
                          <option key={s} value={s}>
                            {SIZE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select name={`region:${r.id}`} defaultValue={r.region ?? ""} aria-label={`Region of ${r.name}`} className={field}>
                        <option value="">Not shown</option>
                        {REGIONS.map((g) => (
                          <option key={g} value={g}>
                            {REGION_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {r.notTakenForward ? (
                        <span className={hint}>Not shown for &ldquo;Not taken forward&rdquo;</span>
                      ) : (
                        <input
                          name={`take:${r.id}`}
                          type="text"
                          maxLength={TAKE_MAX}
                          defaultValue={r.take ?? ""}
                          aria-label={`Move's take on ${r.name}`}
                          autoComplete="off"
                          className={field}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onPreview} disabled={isPending}>
            {preview && !preview.current ? "Preview again" : "Preview"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={isPending || !preview?.current}>
            Publish…
          </Button>
        </div>
        {!preview?.current && <p className={hint}>Preview first: you can only publish what you&apos;ve previewed.</p>}
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-move-navy"}`}>
            {message.text}
          </p>
        )}
      </form>

      <section className="min-w-0" aria-labelledby="report-preview">
        <h2 id="report-preview" className="mb-2 font-display text-base font-semibold text-move-navy">
          Preview: exactly what {clientName} will see
        </h2>
        {preview ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-neutral-bg p-4">
            {!preview.current && (
              <p role="status" className="rounded-lg border border-portal-amber bg-portal-amber-bg px-3 py-2 text-sm text-portal-amber">
                Out of date: you&apos;ve changed the form since this preview. Preview again before publishing.
              </p>
            )}
            <MarketReportView payload={preview.payload} publishedAt={null} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-border p-6 text-sm text-neutral-muted">
            Press Preview to see the report as the client will.
          </p>
        )}
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this Market Report for {clientName}?</DialogTitle>
            <DialogDescription>{REPORT_PUBLISH_CONFIRM}</DialogDescription>
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
