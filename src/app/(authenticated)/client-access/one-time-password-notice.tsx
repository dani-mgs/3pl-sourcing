"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// The one-time password, shown once. It lives only in this component's
// memory: it isn't stored, logged or put in the URL, and it's gone once the
// notice is closed or the page reloads.
export function OneTimePasswordNotice({
  email,
  oneTimePassword,
  onDone,
}: {
  email: string;
  oneTimePassword: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(oneTimePassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-move-green bg-white p-4 text-sm text-move-navy">
      <p className="font-medium">One-time password for {email}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-neutral-bg px-3 py-2 font-mono text-sm break-all select-all">{oneTimePassword}</code>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-neutral-muted">
        It won&apos;t be shown again. Send it to them yourself, ideally by a different channel
        from the email address (a call or a chat message). No email is sent. At their first sign-in
        they must choose their own password before they see anything.
      </p>
      <div>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
