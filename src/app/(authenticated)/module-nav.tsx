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
      className={`rounded px-1 py-px text-[11px] leading-none font-medium tracking-wide uppercase ${className}`}
    >
      Soon
    </span>
  );
}

export function ModuleNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const activeModule = HUB_MODULES.find(
    (module) => module.href && isActive(module.href),
  );

  return (
    <>
      <nav aria-label="Modules" className="hidden shrink-0 min-[1600px]:block">
        <ul className="flex items-center">
          {HUB_MODULES.map((module) => (
            <li key={module.name}>
              {module.href ? (
                <Link
                  href={module.href}
                  aria-current={isActive(module.href) ? "page" : undefined}
                  className={
                    "relative block rounded-md px-2 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors " +
                    (isActive(module.href)
                      ? "bg-white/10 text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-move-green"
                      : "text-white/80 hover:bg-white/10 hover:text-white")
                  }
                >
                  {module.name}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-1 px-2 py-1.5 text-[13px] whitespace-nowrap text-white/40"
                >
                  {module.name}
                  <SoonTag className="bg-white/10 text-white/50" />
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 min-[1600px]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={
              activeModule ? `Modules: ${activeModule.name}` : undefined
            }
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40">
            <span>
              Modules
              {/* Hidden below 900px, where the longer label would squeeze the
                  account name. aria-label keeps the full name at every width. */}
              {activeModule && (
                <span className="max-[899px]:hidden">
                  : {activeModule.name}
                </span>
              )}
            </span>
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {HUB_MODULES.map((module) =>
              module.href ? (
                <DropdownMenuItem
                  key={module.name}
                  render={<Link href={module.href} />}
                  aria-current={isActive(module.href) ? "page" : undefined}
                  className={
                    isActive(module.href)
                      ? "relative bg-neutral-bg font-medium text-move-navy after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-move-green"
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
