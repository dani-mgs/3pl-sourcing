"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BLANK_PROVIDER_DEFAULTS,
  type ProviderFormDefaults,
} from "@/components/provider-form";
import { mergeProviderFields } from "@/lib/merge-provider-fields";
import { extractProviderIntake } from "../extract-provider-actions";
import { NewProviderForm } from "./new-provider-form";

type Mode = "choice" | "upload" | "form";

export function AddProviderEntry({
  clientRequirementId,
}: {
  clientRequirementId: string;
}) {
  const [mode, setMode] = useState<Mode>("choice");
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<ProviderFormDefaults | undefined>(
    undefined,
  );
  const [wasPrefilled, setWasPrefilled] = useState(false);
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(formData: FormData) {
    setUploadError(null);
    startExtraction(async () => {
      const result = await extractProviderIntake(formData);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      const { merged } = mergeProviderFields(
        BLANK_PROVIDER_DEFAULTS,
        result.fields,
      );
      // mergeProviderFields deliberately excludes company_name (see its Edit-flow
      // identity reasoning) — this is a blank canvas, so there's no existing name
      // to protect and it should still pre-fill like every other extracted field.
      if (result.fields.company_name) {
        merged.company_name = result.fields.company_name;
      }

      setPrefilled(merged);
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
        <NewProviderForm
          clientRequirementId={clientRequirementId}
          defaultValues={prefilled}
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
            Accepts .txt, .pdf, or .docx. We&apos;ll pull out any 3PL details
            it can find and pre-fill the form — you can review and edit
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
              disabled={isExtracting}
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
              disabled={isExtracting}
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
              <Button
                type="submit"
                className="px-4 py-2.5"
                disabled={isExtracting}
              >
                {isExtracting ? "Extracting..." : "Extract & Continue"}
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
            Pre-fill the form from a .txt, .pdf, or .docx describing this
            3PL.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMode("form")}
          className="flex flex-col items-start gap-3 rounded-2xl border border-neutral-border p-5 text-left transition-colors hover:border-move-green"
        >
          <FileText className="size-6 text-move-green" />
          <span className="font-display text-base font-semibold text-move-navy">
            Start from Scratch
          </span>
          <span className="text-sm text-neutral-muted">
            Go straight to a blank 3PL form.
          </span>
        </button>
      </div>
    </div>
  );
}
