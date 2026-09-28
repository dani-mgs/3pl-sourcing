"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { reassignOwner, type AdminActionState } from "./actions";
import type { ProjectTable } from "@/lib/auth/get-ownership-context";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";

export type ProfileOption = {
  id: string;
  email: string;
  first_name: string | null;
};

export function ReassignOwnerForm({
  clientRequirementId,
  currentOwnerId,
  profiles,
  table = "three_pl_projects",
}: {
  clientRequirementId: string;
  currentOwnerId: string;
  profiles: ProfileOption[];
  table?: ProjectTable;
}) {
  const [state, formAction, pending] = useActionState<
    AdminActionState,
    FormData
  >(
    async (_prevState, formData) =>
      reassignOwner(
        clientRequirementId,
        formData.get("owner_id") as string,
        table,
      ),
    {},
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="owner_id"
        defaultValue={currentOwnerId}
        disabled={pending}
        className={fieldClass}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.first_name?.trim() || profile.email}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving..." : "Reassign"}
      </Button>
      {state.success && (
        <span className="text-sm font-medium text-move-green">Saved</span>
      )}
      {state.error && (
        <span className="text-sm text-danger">{state.error}</span>
      )}
    </form>
  );
}
