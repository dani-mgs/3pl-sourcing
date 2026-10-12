"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClientUser, type ClientUserActionState } from "./actions";
import { OneTimePasswordNotice } from "./one-time-password-notice";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

const initialState: ClientUserActionState = {};

// Creates a portal login with the role fixed to client. The server decides
// everything but the client, email and first name.
export function CreateClientUserForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createClientUser, initialState);
  const [dismissed, setDismissed] = useState<ClientUserActionState | null>(null);
  const issued = state.issued && dismissed !== state ? state.issued : null;

  if (issued) {
    return (
      <OneTimePasswordNotice
        email={issued.email}
        oneTimePassword={issued.oneTimePassword}
        onDone={() => setDismissed(state)}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="client-user-client" className={labelClass}>
            Client
          </label>
          <select id="client-user-client" name="client_id" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="client-user-email" className={labelClass}>
            Email
          </label>
          <input
            id="client-user-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="e.g. ops@client.com"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="client-user-first-name" className={labelClass}>
            First name
          </label>
          <input
            id="client-user-first-name"
            name="first_name"
            type="text"
            required
            autoComplete="off"
            placeholder="e.g. Pat"
            className={fieldClass}
          />
        </div>
      </div>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create portal user"}
        </Button>
      </div>
    </form>
  );
}
