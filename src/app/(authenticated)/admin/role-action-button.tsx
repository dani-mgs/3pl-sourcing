"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateUserRole } from "./actions";

export function RoleActionButton({
  userId,
  newRole,
  label,
}: {
  userId: string;
  newRole: "admin" | "logistics_expert";
  label: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Saving..." : label}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
