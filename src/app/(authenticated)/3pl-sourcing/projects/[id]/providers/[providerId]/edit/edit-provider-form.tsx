"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ProviderForm, type ProviderFormDefaults } from "@/components/provider-form";
import { mergeProviderFields } from "@/lib/merge-provider-fields";
import { extractProviderIntake } from "../../extract-provider-actions";
import { updateProvider, type UpdateProviderState } from "./actions";

export function EditProviderForm({
  clientRequirementId,
  providerId,
  defaultValues,
}: {
  clientRequirementId: string;
  providerId: string;
  defaultValues: ProviderFormDefaults;
}) {
  const [values, setValues] = useState<ProviderFormDefaults>(defaultValues);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [formKey, setFormKey] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    UpdateProviderState,
    FormData
  >(
    async (_prevState, formData) =>
      updateProvider(clientRequirementId, providerId, formData),
    {},
  );

  function handleUpload(formData: FormData) {
    setUploadError(null);
    setUploadNotice(null);
    startExtraction(async () => {
      const result = await extractProviderIntake(formData, values);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      const { merged, changed } = mergeProviderFields(values, result.fields);

      if (changed.size === 0) {
        setUploadNotice(
          "No new details found in that document — nothing was changed.",
        );
        setUploadOpen(false);
        return;
      }

      setValues(merged);
      setHighlighted(changed);
      setFormKey((k) => k + 1);
      setUploadOpen(false);
      setUploadNotice(
        `Updated ${changed.size} field${changed.size === 1 ? "" : "s"} from "${fileName}" — review before saving.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-move-navy">
          Upload a Document to Update
        </h2>
        <p className="mt-1 text-sm text-neutral-muted">
          Accepts .txt, .pdf, or .docx. We&apos;ll find anything new and merge
          it in — existing fields you&apos;ve already filled in won&apos;t be
          touched.
        </p>

        {!uploadOpen ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2.5"
              onClick={() => {
                setUploadNotice(null);
                setUploadOpen(true);
              }}
            >
              Upload a Document
            </Button>
          </div>
        ) : (
          <form
            action={(formData) => {
              const file = fileInputRef.current?.files?.[0];
              setFileName(file?.name ?? null);
              handleUpload(formData);
            }}
            className="mt-4 flex flex-col gap-4"
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

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2.5"
                onClick={() => {
                  setUploadOpen(false);
                  setUploadError(null);
                }}
                disabled={isExtracting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="px-4 py-2.5"
                disabled={isExtracting}
              >
                {isExtracting ? "Extracting..." : "Extract & Merge"}
              </Button>
            </div>
          </form>
        )}

        {uploadNotice && (
          <p className="mt-4 text-sm text-move-navy">{uploadNotice}</p>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <ProviderForm
          key={formKey}
          formAction={formAction}
          pending={pending}
          error={state.error}
          defaultValues={values}
          highlightedFields={highlighted}
          submitLabel="Save Changes"
          pendingLabel="Saving..."
        />
      </div>
    </div>
  );
}
