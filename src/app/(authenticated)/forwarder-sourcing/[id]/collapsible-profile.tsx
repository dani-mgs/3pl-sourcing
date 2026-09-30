"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

// Collapsed behind a toggle below xl; always open in the desktop side column,
// where the toggle is hidden.
export function CollapsibleProfile({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <section className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-move-navy">{title}</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-muted outline-none hover:text-move-navy focus-visible:ring-2 focus-visible:ring-move-green xl:hidden"
        >
          {open ? "Hide" : "Show"}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={contentId} className={`${open ? "block" : "hidden"} mt-4 xl:block`}>
        {children}
      </div>
    </section>
  );
}
