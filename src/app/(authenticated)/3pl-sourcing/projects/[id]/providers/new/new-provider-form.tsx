"use client";

import { useActionState } from "react";
import { ProviderForm, type ProviderFormDefaults } from "@/components/provider-form";
import { updateProvider } from "../[providerId]/edit/actions";
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
  >(async (prevState, formData) => {
    // The 3PL already exists (only its rate details failed last time), so
    // retry as an update of that row instead of inserting a duplicate.
    if (prevState.savedProviderId) {
      const result = await updateProvider(
        clientRequirementId,
        prevState.savedProviderId,
        formData,
      );
      return { ...result, savedProviderId: prevState.savedProviderId };
    }
    return createProvider(clientRequirementId, formData);
  }, {});

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
