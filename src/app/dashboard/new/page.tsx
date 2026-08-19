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
      <h1 className="mb-6 text-xl font-semibold text-gray-900">
        New Project
      </h1>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="client_name"
            className="text-sm font-medium text-gray-700"
          >
            Client Name
          </label>
          <input
            id="client_name"
            name="client_name"
            type="text"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="project_name"
            className="text-sm font-medium text-gray-700"
          >
            Project Name
          </label>
          <input
            id="project_name"
            name="project_name"
            type="text"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="status"
            className="text-sm font-medium text-gray-700"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="Active"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          >
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create Project"}
        </button>
      </form>
    </div>
  );
}
