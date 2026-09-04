"use client";

import { useActionState } from "react";
import { ProviderForm } from "../provider-form";
import { createProvider, type CreateProviderState } from "./actions";

export function NewProviderForm({
  clientRequirementId,
}: {
  clientRequirementId: string;
}) {
  const [state, formAction, pending] = useActionState<
    CreateProviderState,
    FormData
  >(
    async (_prevState, formData) =>
      createProvider(clientRequirementId, formData),
    {},
  );

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
