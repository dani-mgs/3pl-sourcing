"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [{ label: "Dashboard", href: "/dashboard" }];

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const navItems = isAdmin
    ? [...NAV_ITEMS, { label: "Administration", href: "/admin" }]
    : NAV_ITEMS;

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton isActive={isActive} render={<Link href={item.href} />}>
              {item.label}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
