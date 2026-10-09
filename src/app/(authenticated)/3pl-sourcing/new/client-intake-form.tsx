"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClientIntakeFormFields,
  type ClientIntakeFields,
} from "@/components/client-intake-form";
import {
  ClientPicker,
  selectionDuplicates,
  type ClientSelection,
} from "@/components/client-picker";
import type { ClientOption } from "@/lib/clients";
import { saveClientIntake, type SaveClientIntakeState } from "./actions";

export type { ClientIntakeFields };

export function ClientIntakeForm({
  projectId,
  clients,
  initialClient,
  defaultValues,
  backHref,
  backLabel,
}: {
  projectId: string | null;
  clients: ClientOption[];
  initialClient: ClientSelection;
  defaultValues?: ClientIntakeFields;
  backHref: string;
  backLabel: string;
}) {
  const [client, setClient] = useState<ClientSelection>(initialClient);
  const [localError, setLocalError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    SaveClientIntakeState,
    FormData
  >(async (_prevState, formData) => saveClientIntake(projectId, formData), {});

  // A server-side duplicate (another expert created the client meanwhile)
  // is fed back into the picker so it can offer "Use existing client".
  const knownClients =
    state.existingClient &&
    !clients.some((c) => c.id === state.existingClient!.id)
      ? [...clients, state.existingClient]
      : clients;

  const isEdit = projectId !== null;

  return (
    <form
      // Submitted manually rather than via `action` so React doesn't reset
      // every uncontrolled project field when the server returns an error.
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        if (client.mode === "existing" && !client.clientId) {
          setLocalError("Choose a client.");
          return;
        }
        if (selectionDuplicates(client, knownClients)) {
          return;
        }
        const formData = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <ClientPicker
        clients={knownClients}
        value={client}
        onChange={(next) => {
          setClient(next);
          setLocalError(null);
        }}
        allowNew={!isEdit}
        serverDuplicate={state.existingClient}
      />
      {isEdit && (
        <p className="-mt-3 text-xs text-neutral-muted">
          You can move this project to another existing client. Client names
          and business models can only be edited by an admin.
        </p>
      )}

      <hr className="border-neutral-border" />

      <ClientIntakeFormFields defaultValues={defaultValues} />

      {(localError || state.error) && (
        <p className="text-sm text-danger" role="alert">
          {localError ?? state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href={backHref} />}
          className="px-4 py-2.5"
        >
          {backLabel}
        </Button>

        <div className="flex flex-wrap items-center justify-end gap-3 max-sm:ml-auto">
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="outline"
            disabled={pending}
            className="px-4 py-2.5"
          >
            Save Draft
          </Button>
          <Button
            type="submit"
            name="intent"
            value="continue"
            disabled={pending}
            className="px-4 py-2.5"
          >
            {pending ? "Saving..." : "Continue to Add 3PLs →"}
          </Button>
        </div>
      </div>
    </form>
  );
}
