"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/logout/actions";

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function UserMenu({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-move-green text-xs font-semibold text-white">
          {getInitial(displayName)}
        </span>
        <span>{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {isAdmin && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            Administration
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => logout()}>Log Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
