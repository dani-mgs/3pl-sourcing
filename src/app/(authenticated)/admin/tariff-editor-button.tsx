"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateTariffEditor } from "./actions";

export function TariffEditorButton({ userId, isEditor }: { userId: string; isEditor: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateTariffEditor(userId, !isEditor);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Saving..." : isEditor ? "Revoke tariff editor" : "Make tariff editor"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
