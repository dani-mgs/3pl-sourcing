"use client";

import { useActionState } from "react";
import { ProviderForm, type ProviderFormDefaults } from "@/components/provider-form";
import { createProvider, type CreateProviderState } from "./actions";

export function NewProviderForm({
  clientRequirementId,
  defaultValues,
}: {
  clientRequirementId: string;
  defaultValues?: ProviderFormDefaults;
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
      defaultValues={defaultValues}
      submitLabel="Add 3PL"
      pendingLabel="Adding..."
    />
  );
}
