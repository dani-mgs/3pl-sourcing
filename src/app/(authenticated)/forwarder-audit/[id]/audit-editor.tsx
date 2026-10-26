"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { runAudit } from "@/lib/forwarder-audit/engine";
import { MAX_LINES } from "@/lib/forwarder-audit/lists";
import { blankLine, type InputIssue } from "@/lib/forwarder-audit/input-schema";
import type { AuditInputs, ChargeLineInputs } from "@/lib/forwarder-audit/types";
import { useUnsavedWarning } from "@/app/(authenticated)/landed-cost/[id]/use-unsaved-warning";
import { deleteAuditAction, saveAuditAction } from "../actions";
import { errorTextClass, primaryButtonClass, secondaryButtonClass } from "../styles";
import { AuditResults } from "./audit-results";
import { ChargeLines } from "./charge-lines";
import { QuotationSection, ServicesSection, ShipmentSection } from "./sections";

// One audit: sections 1 to 4 edited as a local draft and saved whole;
// section 5 recalculated from the draft as you type (display only, never
// stored). A viewer who isn't the owner or an admin sees it read-only.

export function AuditEditor({
  auditId,
  initial,
  updatedAt: initialUpdatedAt,
  canEdit,
  ownerName,
}: {
  auditId: string;
  initial: AuditInputs;
  updatedAt: string;
  canEdit: boolean;
  ownerName: string;
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const nextKey = useRef(initial.lines.length);
  const [keys, setKeys] = useState(() => initial.lines.map((_, i) => i));
  const [badFields, setBadFields] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; issues?: InputIssue[] } | null>(null);
  const [pending, start] = useTransition();

  const onBad = useCallback((id: string, bad: boolean) => {
    setBadFields((prev) => {
      if (prev.has(id) === bad) return prev;
      const next = new Set(prev);
      if (bad) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const result = useMemo(() => runAudit(inputs), [inputs]);
  const dirty = JSON.stringify(inputs) !== saved;
  useUnsavedWarning(canEdit && dirty);

  const set = useCallback((updater: (draft: AuditInputs) => AuditInputs) => setInputs(updater), []);
  const changeLine = (index: number, patch: Partial<ChargeLineInputs>) =>
    setInputs((d) => ({ ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  const addLine = () => {
    setInputs((d) => (d.lines.length >= MAX_LINES ? d : { ...d, lines: [...d.lines, blankLine()] }));
    setKeys((k) => (k.length >= MAX_LINES ? k : [...k, nextKey.current++]));
  };
  const removeLine = (index: number) => {
    setInputs((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== index) }));
    setKeys((k) => k.filter((_, i) => i !== index));
  };

  const save = () =>
    start(async () => {
      setMessage(null);
      const result = await saveAuditAction({ auditId, expectedUpdatedAt: updatedAt, inputs });
      if (result.ok) {
        setSaved(JSON.stringify(inputs));
        setUpdatedAt(result.updatedAt);
        setMessage({ kind: "ok", text: "Saved." });
        router.refresh();
      } else setMessage({ kind: "error", text: result.error, issues: result.issues });
    });

  const remove = () => {
    if (!window.confirm("Delete this audit? This can't be undone.")) return;
    start(async () => {
      const result = await deleteAuditAction({ auditId });
      if (result.ok) router.push("/forwarder-audit");
      else setMessage({ kind: "error", text: result.error });
    });
  };

  const common = { inputs, result, onBad, set };
  const blocked = badFields.size > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-move-navy">{inputs.shipment.auditReference || "Forwarder audit"}</h1>
          <p className="mt-1 text-sm text-neutral-muted">
            Owner: {ownerName}
            {!canEdit && " · You can view this audit; only its owner or an admin can change it."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/forwarder-audit/${auditId}/summary`} className={secondaryButtonClass} target="_blank">
            Summary (print)
          </Link>
          {canEdit && (
            <>
              <button type="button" className={secondaryButtonClass} onClick={remove} disabled={pending}>
                Delete audit
              </button>
              <button type="button" className={primaryButtonClass} onClick={save} disabled={pending || !dirty || blocked}>
                {pending ? "Saving…" : dirty ? "Save audit" : "Saved"}
              </button>
            </>
          )}
        </div>
      </div>
      {canEdit && dirty && <p className="text-sm text-neutral-muted">You have unsaved changes. The Summary shows the last saved version.</p>}
      {blocked && (
        <p className={errorTextClass} role="alert">
          Fix the highlighted numbers before saving.
        </p>
      )}
      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-move-green"}>
          <p>{message.text}</p>
          {message.issues && (
            <ul className="list-disc pl-5">
              {message.issues.map((i, k) => (
                <li key={k}>
                  {i.path}: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset disabled={!canEdit} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
        <ShipmentSection {...common} />
        <QuotationSection {...common} />
        <ServicesSection {...common} />
        <ChargeLines lines={inputs.lines} keys={keys} results={result.lines} onChange={changeLine} onAdd={addLine} onRemove={removeLine} onBad={onBad} />
      </fieldset>
      <AuditResults result={result} currency={inputs.quotation.currency} />
    </div>
  );
}
