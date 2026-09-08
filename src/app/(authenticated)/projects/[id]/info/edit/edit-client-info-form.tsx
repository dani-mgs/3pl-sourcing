"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  ClientIntakeFormFields,
  type ClientIntakeFields,
} from "@/components/client-intake-form";
import {
  updateClientRequirements,
  type SaveClientRequirementsState,
} from "./actions";

export function EditClientInfoForm({
  clientRequirementId,
  defaultValues,
}: {
  clientRequirementId: string;
  defaultValues: ClientIntakeFields;
}) {
  const [state, formAction, pending] = useActionState<
    SaveClientRequirementsState,
    FormData
  >(
    async (_prevState, formData) =>
      updateClientRequirements(clientRequirementId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ClientIntakeFormFields defaultValues={defaultValues} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="px-4 py-2.5">
          {pending ? "Saving..." : "Save"}
        </Button>

        {state.error && (
          <span className="text-sm text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
