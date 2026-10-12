"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CLIENT_PASSWORD_MIN } from "@/lib/auth/parse-new-password";
import { changePassword, type ChangePasswordState } from "./actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className={labelClass}>
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={CLIENT_PASSWORD_MIN}
          maxLength={72}
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          className={fieldClass}
        />
        <p id="new-password-hint" className="text-xs text-neutral-muted">
          At least {CLIENT_PASSWORD_MIN} characters. A short sentence works well.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm-password" className={labelClass}>
          New password again
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={fieldClass}
        />
      </div>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save new password"}
        </Button>
      </div>
    </form>
  );
}
