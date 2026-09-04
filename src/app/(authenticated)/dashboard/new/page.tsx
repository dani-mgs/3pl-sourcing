"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="max-w-5xl px-8 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="mt-2 mb-8 font-display text-2xl font-semibold text-move-navy">
        New Project
      </h1>

      <div className="max-w-sm rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="client_name"
              className="text-sm font-medium text-move-navy"
            >
              Client Name
            </label>
            <input
              id="client_name"
              name="client_name"
              type="text"
              required
              placeholder="e.g. Acme Corp"
              className="rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="status"
              className="text-sm font-medium text-move-navy"
            >
              Status
            </label>
            <Select name="status" defaultValue="Active">
              <SelectTrigger id="status" className="w-full rounded-xl border-neutral-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <Button type="submit" disabled={pending} className="mt-2 px-4 py-2.5">
            {pending ? "Creating..." : "Create Project"}
          </Button>
        </form>
      </div>
    </div>
  );
}
