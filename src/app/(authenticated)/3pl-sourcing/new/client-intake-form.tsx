"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClientIntakeFormFields,
  type ClientIntakeFields,
} from "@/components/client-intake-form";
import { saveClientIntake, type SaveClientIntakeState } from "./actions";

export type { ClientIntakeFields };

export function ClientIntakeForm({
  clientRequirementId,
  defaultValues,
  backHref,
  backLabel,
}: {
  clientRequirementId: string | null;
  defaultValues?: ClientIntakeFields;
  backHref: string;
  backLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    SaveClientIntakeState,
    FormData
  >(
    async (_prevState, formData) =>
      saveClientIntake(clientRequirementId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ClientIntakeFormFields defaultValues={defaultValues} />

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href={backHref} />}
          className="px-4 py-2.5"
        >
          {backLabel}
        </Button>

        <div className="flex items-center gap-3">
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
