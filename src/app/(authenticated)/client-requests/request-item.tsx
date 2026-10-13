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
import { LocalDate } from "@/components/client-portal/local-date";
import { MESSAGE_MAX, STATUS_LABELS, WITHDRAW_CONFIRM, replyWarning } from "@/lib/client-requests/text";
import { markClientRequestSeen, replyToClientRequest, withdrawClientRequestReply } from "./actions";

// One request in the inbox. Opening it is the explicit "seen" action (only
// for the project's owner or an admin, and only while it's unseen): never a
// page render or a prefetch.

export type RequestItemView = {
  id: string;
  kindLabel: string;
  title: string;
  message: string | null;
  decisionDetail: string | null;
  wantsCall: boolean;
  status: "sent" | "seen" | "answered";
  createdAt: string;
  from: string;
  clientName: string;
  projectLabel: string;
  projectHref: string;
  reply: string | null;
  repliedAt: string | null;
  replier: string | null;
  withdrawn: { reply: string; by: string; at: string | null }[];
  canAct: boolean;
  isAdmin: boolean;
};

const field =
  "w-full min-w-0 rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";

export function RequestItem({ item }: { item: RequestItemView }) {
  const marked = useRef(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || !item.canAct || item.status !== "sent" || marked.current) return;
    marked.current = true;
    startTransition(async () => {
      const result = await markClientRequestSeen(item.id);
      if ("error" in result) setMessage({ tone: "error", text: result.error });
    });
  }

  function onReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await replyToClientRequest(data);
      setMessage("error" in result ? { tone: "error", text: result.error } : { tone: "ok", text: result.ok });
    });
  }

  function onWithdraw() {
    setMessage(null);
    startTransition(async () => {
      const result = await withdrawClientRequestReply(item.id);
      setConfirmWithdraw(false);
      setMessage("error" in result ? { tone: "error", text: result.error } : { tone: "ok", text: result.ok });
    });
  }

  return (
    <li className="rounded-xl border border-neutral-border bg-white">
      <details onToggle={onToggle}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-move-navy">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "sent" ? "bg-move-green text-move-navy" : "bg-neutral-bg"}`}>
            {item.status === "sent" ? "New" : STATUS_LABELS[item.status]}
          </span>
          <span className="font-semibold">{item.kindLabel}</span>
          <span className="min-w-0 break-words">{item.title}</span>
          <span className="text-neutral-muted">
            {item.clientName} · {item.from} · <LocalDate timestamp={item.createdAt} />
          </span>
          {item.wantsCall && <span className="rounded-full bg-portal-amber-bg px-2 py-0.5 text-xs font-semibold text-portal-amber">Wants a call</span>}
        </summary>
        <div className="flex flex-col gap-3 border-t border-neutral-border p-4 text-sm text-move-navy">
          <p className="text-neutral-muted">
            <a href={item.projectHref} className="underline">
              {item.projectLabel}
            </a>
          </p>
          {item.decisionDetail && <p>{item.decisionDetail}</p>}
          {item.message && <p className="whitespace-pre-line">{item.message}</p>}

          {item.reply && (
            <div className="rounded-lg bg-neutral-bg px-3 py-2">
              <p className="text-xs font-semibold text-neutral-muted">
                Reply shown to the client{item.replier ? ` · ${item.replier}` : ""}
                {item.repliedAt ? (
                  <>
                    {" · "}
                    <LocalDate timestamp={item.repliedAt} />
                  </>
                ) : null}
              </p>
              <p className="mt-1 whitespace-pre-line">{item.reply}</p>
              {item.isAdmin && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setConfirmWithdraw(true)} disabled={isPending}>
                  Withdraw reply (admin)
                </Button>
              )}
            </div>
          )}

          {item.withdrawn.length > 0 && (
            <div className="rounded-lg border border-dashed border-neutral-border px-3 py-2 text-neutral-muted">
              <p className="text-xs font-semibold">Withdrawn replies (staff only; the client doesn&apos;t see these)</p>
              <ul className="mt-1 flex flex-col gap-1">
                {item.withdrawn.map((w, i) => (
                  <li key={i}>
                    <span className="whitespace-pre-line">{w.reply}</span>
                    <span className="block text-xs">
                      Withdrawn by {w.by}
                      {w.at ? (
                        <>
                          {" · "}
                          <LocalDate timestamp={w.at} />
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.status !== "answered" &&
            (item.canAct ? (
              <form onSubmit={onReply} className="flex flex-col gap-2">
                <input type="hidden" name="requestId" value={item.id} />
                <label htmlFor={`reply-${item.id}`} className="font-medium">
                  Reply to the client
                </label>
                <textarea id={`reply-${item.id}`} name="reply" required maxLength={MESSAGE_MAX.reply} rows={4} className={field} />
                <p role="note" className="rounded-lg border border-portal-amber bg-portal-amber-bg px-3 py-2 text-portal-amber">
                  {replyWarning(item.clientName)}
                </p>
                <Button type="submit" className="self-start" disabled={isPending}>
                  {isPending ? "Sending…" : "Send reply"}
                </Button>
              </form>
            ) : (
              <p className="text-neutral-muted">Only the project&apos;s owner or an admin can reply.</p>
            ))}

          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-danger" : ""}>
              {message.text}
            </p>
          )}
        </div>
      </details>

      <Dialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this reply?</DialogTitle>
            <DialogDescription>{WITHDRAW_CONFIRM}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmWithdraw(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onWithdraw} disabled={isPending}>
              {isPending ? "Withdrawing…" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
