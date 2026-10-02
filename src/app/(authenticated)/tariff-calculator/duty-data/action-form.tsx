"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { DutyDataActionState } from "./actions";

// A form that calls one duty-data server action and shows its result.
// Dispatched by hand so a failed submit keeps what was typed; a successful
// add can clear the form.
export function ActionForm({
  action,
  submitLabel,
  children,
  resetOnSuccess = false,
  variant = "default",
  className = "flex flex-col gap-3",
}: {
  action: (formData: FormData) => Promise<DutyDataActionState>;
  submitLabel: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [state, setState] = useState<DutyDataActionState>({});
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result.success && resetOnSuccess) form.reset();
    });
  }

  return (
    <form onSubmit={submit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : submitLabel}
        </Button>
        {state.success && <span className="text-sm font-medium text-move-green">{state.success}</span>}
        {state.error && (
          <span role="alert" className="text-sm text-danger">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
