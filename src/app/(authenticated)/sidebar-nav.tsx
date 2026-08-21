"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [{ label: "Dashboard", href: "/dashboard" }];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "flex items-center gap-2 rounded-xl bg-[#2A3F73] border-l-4 border-[#44B048] px-4 py-2.5 text-sm font-medium text-white"
                : "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
