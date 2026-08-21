"use client";

import { useActionState } from "react";
import { ProviderForm, type ProviderFormDefaults } from "../../provider-form";
import { updateProvider, type UpdateProviderState } from "./actions";

export function EditProviderForm({
  projectId,
  providerId,
  defaultValues,
}: {
  projectId: string;
  providerId: string;
  defaultValues: ProviderFormDefaults;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateProviderState,
    FormData
  >(
    async (_prevState, formData) =>
      updateProvider(projectId, providerId, formData),
    {},
  );

  return (
    <ProviderForm
      formAction={formAction}
      pending={pending}
      error={state.error}
      defaultValues={defaultValues}
      submitLabel="Save Changes"
      pendingLabel="Saving..."
    />
  );
}
