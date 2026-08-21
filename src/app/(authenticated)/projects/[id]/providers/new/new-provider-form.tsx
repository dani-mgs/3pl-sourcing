"use client";

import { useActionState } from "react";
import { ProviderForm } from "../provider-form";
import { createProvider, type CreateProviderState } from "./actions";

export function NewProviderForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<
    CreateProviderState,
    FormData
  >(async (_prevState, formData) => createProvider(projectId, formData), {});

  return (
    <ProviderForm
      formAction={formAction}
      pending={pending}
      error={state.error}
      submitLabel="Add Provider"
      pendingLabel="Adding..."
    />
  );
}
