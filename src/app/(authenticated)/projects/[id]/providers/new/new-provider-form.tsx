"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createProvider, type CreateProviderState } from "./actions";

const STATUS_OPTIONS = [
  "Potential",
  "Contacted",
  "Discovery Call",
  "Quotation Received",
  "Negotiation",
  "Vetted",
  "Rejected",
];

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

export function NewProviderForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    CreateProviderState,
    FormData
  >(async (_prevState, formData) => createProvider(projectId, formData), {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="company_name" className={labelClass}>
          Company Name
        </label>
        <input
          id="company_name"
          name="company_name"
          type="text"
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="website" className={labelClass}>
          Website
        </label>
        <input id="website" name="website" type="text" className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="contact_person" className={labelClass}>
          Contact Person
        </label>
        <input
          id="contact_person"
          name="contact_person"
          type="text"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <input id="phone" name="phone" type="text" className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location" className={labelClass}>
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className={labelClass}>
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue="Potential"
          className={fieldClass}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2 px-4 py-2.5">
        {pending ? "Adding..." : "Add Provider"}
      </Button>
    </form>
  );
}
