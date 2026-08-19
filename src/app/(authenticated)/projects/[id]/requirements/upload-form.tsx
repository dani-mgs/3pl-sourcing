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
        <label htmlFor="type" className="text-sm font-medium text-ink-navy">
          Document Type
        </label>
        <select
          id="type"
          name="type"
          defaultValue="rfi"
          className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
        >
          <option value="rfi">RFI</option>
          <option value="kickoff_transcript">Kickoff Meeting Transcript</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium text-ink-navy">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy file:mr-3 file:rounded-lg file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-navy"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-route-indigo px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-route-indigo-hover disabled:opacity-50"
      >
        {pending ? "Uploading..." : "Upload"}
      </button>

      {state.error && (
        <p className="w-full text-sm text-danger-rose">{state.error}</p>
      )}
    </form>
  );
}
