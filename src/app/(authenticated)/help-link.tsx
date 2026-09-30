"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { NAV_LINK_ACTIVE_CLASS, NAV_LINK_CLASS, NAV_LINK_IDLE_CLASS } from "./module-nav";

// "?" + "Help" beside the avatar; the label hides below sm, the aria-label
// doesn't. Highlighted like an active module while on /help.
export function HelpLink() {
  const active = usePathname() === "/help";
  return (
    <Link
      href="/help"
      aria-label="Help"
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 ${NAV_LINK_CLASS} ${active ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_IDLE_CLASS}`}
    >
      <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
      <span className="max-sm:hidden">Help</span>
    </Link>
  );
}
