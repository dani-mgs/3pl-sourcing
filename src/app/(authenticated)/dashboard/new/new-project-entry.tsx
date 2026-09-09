"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientIntakeFields } from "@/components/client-intake-form";
import { ClientIntakeForm } from "./client-intake-form";
import { extractClientIntake } from "./extract-actions";

type Mode = "choice" | "upload" | "form";

export function NewProjectEntry() {
  const [mode, setMode] = useState<Mode>("choice");
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<ClientIntakeFields | undefined>(
    undefined,
  );
  const [wasPrefilled, setWasPrefilled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(formData: FormData) {
    setUploadError(null);
    startTransition(async () => {
      const result = await extractClientIntake(formData);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      setPrefilled(result.fields);
      setWasPrefilled(true);
      setMode("form");
    });
  }

  if (mode === "form") {
    return (
      <div className="flex flex-col gap-4">
        {wasPrefilled && (
          <div className="rounded-xl border border-move-green/30 bg-move-green/5 p-3 text-sm text-move-navy">
            Pre-filled from &quot;{fileName}&quot; — review before saving.
            Anything not clearly stated in the document was left blank.
          </div>
        )}
        <ClientIntakeForm
          clientRequirementId={null}
          defaultValues={prefilled}
          backHref="/dashboard/new"
          backLabel="← Back"
        />
      </div>
    );
  }

  if (mode === "upload") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-move-navy">
            Upload a Document
          </h2>
          <p className="mt-1 text-sm text-neutral-muted">
            Accepts .txt, .pdf, or .docx. We&apos;ll pull out any client
            details it can find and pre-fill Step 1 — you can review and edit
            everything before saving.
          </p>
        </div>

        <form
          action={(formData) => {
            handleUpload(formData);
          }}
          className="flex flex-col gap-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            name="document"
            accept=".txt,.pdf,.docx"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              Choose File
            </Button>
            <span className="text-sm text-neutral-muted">
              {fileName ?? "No file chosen"}
            </span>
          </div>

          {uploadError && (
            <p className="text-sm text-danger">{uploadError}</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2.5"
              onClick={() => {
                setUploadError(null);
                setMode("choice");
              }}
              disabled={isPending}
            >
              ← Back
            </Button>

            <div className="flex items-center gap-3">
              {uploadError && (
                <Button
                  type="button"
                  variant="outline"
                  className="px-4 py-2.5"
                  onClick={() => setMode("form")}
                >
                  Continue with a blank form
                </Button>
              )}
              <Button type="submit" className="px-4 py-2.5" disabled={isPending}>
                {isPending ? "Extracting..." : "Extract & Continue"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-move-navy">
        How would you like to start?
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className="flex flex-col items-start gap-3 rounded-2xl border border-neutral-border p-5 text-left transition-colors hover:border-move-green"
        >
          <Upload className="size-6 text-move-green" />
          <span className="font-display text-base font-semibold text-move-navy">
            Upload a Document
          </span>
          <span className="text-sm text-neutral-muted">
            Pre-fill the form from a .txt, .pdf, or .docx describing the
            client&apos;s needs.
          </span>
        </button>

        <Link
          href="/dashboard/new/manual"
          className="flex flex-col items-start gap-3 rounded-2xl border border-neutral-border p-5 text-left transition-colors hover:border-move-green"
        >
          <FileText className="size-6 text-move-green" />
          <span className="font-display text-base font-semibold text-move-navy">
            Start from Scratch
          </span>
          <span className="text-sm text-neutral-muted">
            Go straight to a blank Client Intake form.
          </span>
        </Link>
      </div>
    </div>
  );
}
