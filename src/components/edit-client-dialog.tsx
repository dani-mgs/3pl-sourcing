"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateClient } from "@/app/(authenticated)/admin/client-actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

// Admin-only: renames a shared client or changes its business model. Every
// project for this client shows the change.
export function EditClientDialog({
  clientId,
  currentName,
  currentBusinessModel,
}: {
  clientId: string;
  currentName: string;
  currentBusinessModel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [businessModel, setBusinessModel] = useState(
    currentBusinessModel ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateClient(clientId, name, businessModel);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setName(currentName);
          setBusinessModel(currentBusinessModel ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`Edit client ${currentName}`}
          />
        }
      >
        Edit client
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>
            Changes apply to every project for this client.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <label htmlFor={`client-name-${clientId}`} className={labelClass}>
            Client Name
          </label>
          <input
            id={`client-name-${clientId}`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`client-bm-${clientId}`} className={labelClass}>
            Business Model
          </label>
          <input
            id={`client-bm-${clientId}`}
            type="text"
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            placeholder="e.g. B2C DTC"
            className={fieldClass}
          />
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="button" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
