"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadDocument, type UploadDocumentState } from "./actions";

const TYPE_OPTIONS = [
  { value: "rfi", label: "RFI" },
  { value: "kickoff_transcript", label: "Kickoff Meeting Transcript" },
  { value: "other", label: "Other" },
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function UploadForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    UploadDocumentState,
    FormData
  >(async (_prevState, formData) => uploadDocument(projectId, formData), {});
  const [sizeError, setSizeError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const fileInput = event.currentTarget.elements.namedItem(
      "file",
    ) as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      event.preventDefault();
      setSizeError("File exceeds the 10MB upload limit");
      return;
    }

    setSizeError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-sm font-medium text-move-navy">
          Document Type
        </label>
        <Select name="type" items={TYPE_OPTIONS} defaultValue="rfi">
          <SelectTrigger id="type" className="w-full rounded-xl border-neutral-border sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium text-move-navy">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="application/pdf,.doc,.docx,image/png,image/jpeg"
          className="rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-move-navy"
        />
      </div>

      <Button type="submit" disabled={pending} className="px-4 py-2.5">
        {pending ? "Uploading..." : "Upload"}
      </Button>

      {sizeError && <p className="w-full text-sm text-danger">{sizeError}</p>}
      {!sizeError && state.error && (
        <p className="w-full text-sm text-danger">{state.error}</p>
      )}
    </form>
  );
}
