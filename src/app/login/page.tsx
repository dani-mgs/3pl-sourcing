"use client";

import { useActionState } from "react";
import { login } from "./actions";

type LoginState = { error?: string };

async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await login(formData);
  return result ?? {};
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4">
      <div className="w-full max-w-sm rounded-2xl border border-fog bg-white p-8 shadow-sm">
        <h1 className="mb-6 font-display text-2xl font-semibold text-ink-navy">
          Sign in
        </h1>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-ink-navy">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-ink-navy">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-xl border border-fog px-3 py-2 text-sm text-ink-navy focus:border-route-indigo focus:outline-none focus:ring-2 focus:ring-route-indigo"
            />
          </div>

          {state.error && (
            <p className="text-sm text-danger-rose">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-xl bg-route-indigo px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-route-indigo-hover disabled:opacity-50"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
