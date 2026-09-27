"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HUB_MODULES } from "@/lib/modules";

function SoonTag({ className }: { className: string }) {
  return (
    <span
      className={`rounded px-1 py-px text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      Soon
    </span>
  );
}

export function ModuleNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav aria-label="Modules" className="hidden shrink-0 min-[1760px]:block">
        <ul className="flex items-center gap-1">
          {HUB_MODULES.map((module) => (
            <li key={module.name}>
              {module.href ? (
                <Link
                  href={module.href}
                  aria-current={isActive(module.href) ? "page" : undefined}
                  className={
                    "block rounded-md border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors " +
                    (isActive(module.href)
                      ? "border-move-green bg-white/10 text-white"
                      : "border-transparent text-white/80 hover:bg-white/10 hover:text-white")
                  }
                >
                  {module.name}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-1.5 border-b-2 border-transparent px-3 py-1.5 text-sm whitespace-nowrap text-white/40"
                >
                  {module.name}
                  <SoonTag className="bg-white/10 text-white/50" />
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 min-[1760px]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40">
            Modules
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {HUB_MODULES.map((module) =>
              module.href ? (
                <DropdownMenuItem
                  key={module.name}
                  render={<Link href={module.href} />}
                  className={
                    isActive(module.href)
                      ? "font-medium text-move-navy shadow-[inset_2px_0_0_var(--color-move-green)]"
                      : undefined
                  }
                >
                  {module.name}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={module.name}
                  disabled
                  className="justify-between"
                >
                  {module.name}
                  <SoonTag className="bg-neutral-bg text-neutral-muted" />
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
