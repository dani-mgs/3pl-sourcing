"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox } from "lucide-react";
import { NAV_LINK_ACTIVE_CLASS, NAV_LINK_CLASS, NAV_LINK_IDLE_CLASS } from "./module-nav";

// "Client requests" beside Help, with the number of unseen requests on the
// viewer's projects (all projects for admins). The label hides below sm; the
// aria-label says the count.
export function RequestsLink({ count }: { count: number }) {
  const active = usePathname() === "/client-requests";
  const label = count > 0 ? `Client requests, ${count} new` : "Client requests";
  return (
    <Link
      href="/client-requests"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 ${NAV_LINK_CLASS} ${active ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_IDLE_CLASS}`}
    >
      <Inbox className="size-4 shrink-0" aria-hidden="true" />
      <span className="max-sm:hidden">Requests</span>
      {count > 0 && (
        <span aria-hidden="true" className="rounded-full bg-move-green px-1.5 text-xs font-bold text-move-navy">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
