"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetClientPassword } from "./actions";
import { OneTimePasswordNotice } from "./one-time-password-notice";

// Admins only: there are no reset emails, so a client who has lost their
// password gets a new one-time password from an admin.
export function ResetClientPasswordButton({ userId, userLabel }: { userId: string; userLabel: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; oneTimePassword: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await resetClientPassword(userId);
      setOpen(false);
      if (result.error) setError(result.error);
      else if (result.issued) setIssued(result.issued);
    });
  }

  if (issued) {
    return <OneTimePasswordNotice email={issued.email} oneTimePassword={issued.oneTimePassword} onDone={() => setIssued(null)} />;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="outline" disabled={isPending} />}>
          {isPending ? "Resetting..." : "Reset password"}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Give {userLabel} a new one-time password? Their current password stops working at once,
              and they must choose a new one at their next sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
