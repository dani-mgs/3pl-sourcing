"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitClientRequest } from "@/app/portal/actions";
import {
  ACTION_LABELS,
  CALL_LABEL,
  INTRODUCTION_CONFIRM,
  INTRODUCTION_NOTE_HINT,
  INTRODUCTION_NOTE_LABEL,
  introductionBody,
  introductionTitle,
  UNLOCK_BODY,
  UNLOCK_CONFIRM,
  UNLOCK_NOTE_LABEL,
  UNLOCK_TITLE,
  APPROVE_CONFIRM,
  APPROVE_NOTE_HINT,
  APPROVE_NOTE_LABEL,
  approveBody,
  approveTitle,
  CANCEL,
  CHANGES_BODY,
  CHANGES_CONFIRM,
  CHANGES_REASON_LABEL,
  CHANGES_TITLE,
  MESSAGE_MAX,
  QUESTION_CALL_LABEL,
  QUESTION_BODY,
  QUESTION_CONFIRM,
  QUESTION_LABEL,
  QUESTION_PROJECT_LABEL,
  QUESTION_TITLE,
} from "@/lib/client-requests/text";

// The client's actions in the portal. Each opens a dialog (the confirm
// step); the server action and the database decide whether it goes through.

export type ProjectOption = { key: string; label: string };

const field =
  "w-full min-w-0 rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-portal-ink focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";

function RequestDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  hidden,
  children,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirm: string;
  hidden: Record<string, string>;
  children: ReactNode;
  onSent: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await submitClientRequest(data);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onSent(result.ok);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {CANCEL}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionFields({ projects, defaultKey }: { projects: ProjectOption[]; defaultKey: string | null }) {
  const id = useId();
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-project`} className="text-sm font-medium text-portal-ink">
          {QUESTION_PROJECT_LABEL}
        </label>
        <select id={`${id}-project`} name="engagementKey" required defaultValue={defaultKey ?? ""} className={field}>
          {defaultKey == null && (
            <option value="" disabled>
              Choose a project
            </option>
          )}
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-message`} className="text-sm font-medium text-portal-ink">
          {QUESTION_LABEL}
        </label>
        <textarea id={`${id}-message`} name="message" required maxLength={MESSAGE_MAX.question} rows={4} className={field} />
      </div>
      <label className="flex items-center gap-2 text-sm text-portal-ink">
        <input type="checkbox" name="wantsCall" className="size-4" />
        {QUESTION_CALL_LABEL}
      </label>
    </>
  );
}

function SentNote({ text }: { text: string | null }) {
  return text ? (
    <p role="status" className="text-sm font-semibold text-portal-ink">
      {text}
    </p>
  ) : null;
}

// On the recommendation card of the latest update, until someone at the
// client decides.
export function DecisionActions({
  engagementKey,
  updateKey,
  recommendationName,
  projects,
}: {
  engagementKey: string;
  updateKey: string;
  recommendationName: string;
  projects: ProjectOption[];
}) {
  const [open, setOpen] = useState<"approve" | "changes" | "ask" | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const id = useId();
  const set = (o: boolean, which: typeof open) => setOpen(o ? which : null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setOpen("approve")}>
          {ACTION_LABELS.approve}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen("changes")}>
          {ACTION_LABELS.requestChanges}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen("ask")}>
          {ACTION_LABELS.ask}
        </Button>
      </div>
      <SentNote text={sent} />

      <RequestDialog
        open={open === "approve"}
        onOpenChange={(o) => set(o, "approve")}
        title={approveTitle(recommendationName)}
        description={approveBody(recommendationName)}
        confirm={APPROVE_CONFIRM}
        hidden={{ kind: "approve", engagementKey, updateKey }}
        onSent={setSent}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-note`} className="text-sm font-medium text-portal-ink">
            {APPROVE_NOTE_LABEL}
          </label>
          <textarea id={`${id}-note`} name="message" maxLength={MESSAGE_MAX.approve} rows={3} className={field} />
          <p className="text-xs text-portal-muted">{APPROVE_NOTE_HINT}</p>
        </div>
      </RequestDialog>

      <RequestDialog
        open={open === "changes"}
        onOpenChange={(o) => set(o, "changes")}
        title={CHANGES_TITLE}
        description={CHANGES_BODY}
        confirm={CHANGES_CONFIRM}
        hidden={{ kind: "request_changes", engagementKey, updateKey }}
        onSent={setSent}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-reason`} className="text-sm font-medium text-portal-ink">
            {CHANGES_REASON_LABEL}
          </label>
          <textarea id={`${id}-reason`} name="message" required maxLength={MESSAGE_MAX.request_changes} rows={3} className={field} />
        </div>
      </RequestDialog>

      <RequestDialog
        open={open === "ask"}
        onOpenChange={(o) => set(o, "ask")}
        title={QUESTION_TITLE}
        description={QUESTION_BODY}
        confirm={QUESTION_CONFIRM}
        hidden={{ kind: "question" }}
        onSent={setSent}
      >
        <QuestionFields projects={projects} defaultKey={engagementKey} />
      </RequestDialog>
    </div>
  );
}

// "New question" under Your questions. With one project it's preselected.
export function NewQuestionButton({ projects }: { projects: ProjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  if (projects.length === 0) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {ACTION_LABELS.newQuestion}
      </Button>
      <SentNote text={sent} />
      <RequestDialog
        open={open}
        onOpenChange={setOpen}
        title={QUESTION_TITLE}
        description={QUESTION_BODY}
        confirm={QUESTION_CONFIRM}
        hidden={{ kind: "question" }}
        onSent={setSent}
      >
        <QuestionFields projects={projects} defaultKey={projects.length === 1 ? projects[0].key : null} />
      </RequestDialog>
    </div>
  );
}

function NoteAndCall({ label, hint, max }: { label: string; hint?: string; max: number }) {
  const id = useId();
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-sm font-medium text-portal-ink">
          {label}
        </label>
        <textarea id={`${id}-note`} name="message" maxLength={max} rows={3} className={field} />
        {hint && <p className="text-xs text-portal-muted">{hint}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-portal-ink">
        <input type="checkbox" name="wantsCall" className="size-4" />
        {CALL_LABEL}
      </label>
    </>
  );
}

// "Request introduction" on a lettered row of the paid Market Report. The
// letter is all the client knows; the database checks it against the latest
// report and the plan.
export function IntroductionButton({ engagementKey, letter }: { engagementKey: string; letter: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const label = `Partner ${letter}`;
  if (sent) return <SentNote text={sent} />;
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`${ACTION_LABELS.requestIntroduction} to ${label}`}>
        {ACTION_LABELS.requestIntroduction}
      </Button>
      <RequestDialog
        open={open}
        onOpenChange={setOpen}
        title={introductionTitle(label)}
        description={introductionBody(label)}
        confirm={INTRODUCTION_CONFIRM}
        hidden={{ kind: "introduction", engagementKey, label: letter }}
        onSent={setSent}
      >
        <NoteAndCall label={INTRODUCTION_NOTE_LABEL} hint={INTRODUCTION_NOTE_HINT} max={MESSAGE_MAX.introduction} />
      </RequestDialog>
    </>
  );
}

// "Unlock the Market Report" on the free plan's locked page. No price: Move's
// contact follows up.
export function UnlockButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  if (sent) return <SentNote text={sent} />;
  return (
    <>
      <Button type="button" className="self-start" onClick={() => setOpen(true)}>
        {ACTION_LABELS.unlockReport}
      </Button>
      <RequestDialog
        open={open}
        onOpenChange={setOpen}
        title={UNLOCK_TITLE}
        description={UNLOCK_BODY}
        confirm={UNLOCK_CONFIRM}
        hidden={{ kind: "report_interest" }}
        onSent={setSent}
      >
        <NoteAndCall label={UNLOCK_NOTE_LABEL} max={MESSAGE_MAX.report_interest} />
      </RequestDialog>
    </>
  );
}
