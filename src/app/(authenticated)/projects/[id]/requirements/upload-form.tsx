"use client";

import { useActionState } from "react";
import { uploadDocument, type UploadDocumentState } from "./actions";

export function UploadForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    UploadDocumentState,
    FormData
  >(async (_prevState, formData) => uploadDocument(projectId, formData), {});

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
          defaultValue="rfi"
          className="rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green"
        >
          <option value="rfi">RFI</option>
          <option value="kickoff_transcript">Kickoff Meeting Transcript</option>
          <option value="other">Other</option>
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
