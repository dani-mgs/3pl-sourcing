"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAuditAction } from "./actions";
import { errorTextClass, primaryButtonClass } from "./styles";

export function NewAuditButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={primaryButtonClass}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await createAuditAction();
            if (result.ok) router.push(`/forwarder-audit/${result.auditId}`);
            else setError(result.error);
          })
        }
      >
        {pending ? "Creating…" : "New audit"}
      </button>
      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
