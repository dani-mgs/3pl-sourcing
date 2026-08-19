"use client";

import { useActionState } from "react";
import { createProject } from "./actions";

type NewProjectState = { error?: string };

async function createProjectAction(
  _prevState: NewProjectState,
  formData: FormData,
): Promise<NewProjectState> {
  const result = await createProject(formData);
  return result ?? {};
}

export default function NewProjectPage() {
  const [state, formAction, pending] = useActionState<
    NewProjectState,
    FormData
  >(createProjectAction, {});

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink-navy">
        New Project
      </h1>

      <div className="rounded-2xl border border-fog bg-white p-6 shadow-sm">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="client_name"
              className="text-sm font-medium text-ink-navy"
            >
              Client Name
            </label>
            <input
              id="client_name"
              name="client_name"
              type="text"
              required
              className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="project_name"
              className="text-sm font-medium text-ink-navy"
            >
              Project Name
            </label>
            <input
              id="project_name"
              name="project_name"
              type="text"
              required
              className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="status"
              className="text-sm font-medium text-ink-navy"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue="Active"
              className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
            >
              <option value="Active">Active</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {state.error && (
            <p className="text-sm text-danger-rose">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-xl bg-route-indigo px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-route-indigo-hover disabled:opacity-50"
          >
            {pending ? "Creating..." : "Create Project"}
          </button>
        </form>
      </div>
    </div>
  );
}
