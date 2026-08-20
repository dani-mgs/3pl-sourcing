"use client";

import { useActionState } from "react";
import {
  uploadProviderDocument,
  type UploadProviderDocumentState,
} from "./actions";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "discovery_transcript", label: "Discovery Call Transcript" },
  { value: "notes", label: "Notes" },
  { value: "document", label: "Documents" },
  { value: "quotation", label: "Quotation" },
  { value: "revised_quotation", label: "Revised Quotation" },
];

export function UploadProviderDocumentForm({
  projectId,
  providerId,
}: {
  projectId: string;
  providerId: string;
}) {
  const [state, formAction, pending] = useActionState<
    UploadProviderDocumentState,
    FormData
  >(
    async (_prevState, formData) =>
      uploadProviderDocument(projectId, providerId, formData),
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-sm font-medium text-move-navy">
          Document Type
        </label>
        <select
          id="type"
          name="type"
          defaultValue="discovery_transcript"
          className="rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
          className="rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-move-navy"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-move-green px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-move-green-hover disabled:opacity-50"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>

      {state.error && (
        <p className="w-full text-sm text-danger">{state.error}</p>
      )}
    </form>
  );
}
