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

const LIVE_MODULES = HUB_MODULES.filter((module) => module.href);
const COMING_SOON = HUB_MODULES.filter((module) => !module.href);

// Navy text on amber: 7.95:1, so it reads on both the navy header and the
// white menus.
function SoonTag() {
  return (
    <span className="rounded-full bg-[#FBBF24] px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-move-navy uppercase">
      Soon
    </span>
  );
}

// Menus fade disabled items to 50% opacity by default, which would drop the
// module name and the badge below readable contrast. Full opacity with muted
// text (4.83:1 on white) still reads as unavailable.
const COMING_SOON_ITEM_CLASS =
  "flex-col items-start gap-0.5 text-neutral-muted data-disabled:opacity-100";

export const NAV_LINK_CLASS =
  "relative block rounded-md px-2 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40";
export const NAV_LINK_ACTIVE_CLASS =
  "bg-white/10 text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-move-green";
export const NAV_LINK_IDLE_CLASS = "text-white/80 hover:bg-white/10 hover:text-white";

export function ModuleNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const activeModule = HUB_MODULES.find(
    (module) => module.href && isActive(module.href),
  );

  return (
    <>
      {/* lg and up: live modules inline, the rest behind "Coming soon". */}
      <nav aria-label="Modules" className="hidden shrink-0 lg:block">
        <ul className="flex items-center">
          {LIVE_MODULES.map((module) => (
            <li key={module.name}>
              <Link
                href={module.href!}
                aria-current={isActive(module.href!) ? "page" : undefined}
                className={`${NAV_LINK_CLASS} ${isActive(module.href!) ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_IDLE_CLASS}`}
              >
                {module.name}
              </Link>
            </li>
          ))}
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Coming soon: ${COMING_SOON.length} modules`}
                className={`flex items-center gap-1.5 ${NAV_LINK_CLASS} ${NAV_LINK_IDLE_CLASS} aria-expanded:bg-white/10`}
              >
                Coming soon
                <span className="rounded-full bg-[#FBBF24] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-move-navy">
                  {COMING_SOON.length}
                </span>
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {COMING_SOON.map((module) => (
                  <DropdownMenuItem key={module.name} disabled className={COMING_SOON_ITEM_CLASS}>
                    <span className="flex items-center gap-2 font-medium">
                      {module.name}
                      <SoonTag />
                    </span>
                    <span className="text-xs">{module.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </nav>

      {/* Below lg: every module in one menu. */}
      <div className="shrink-0 lg:hidden">
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
            {LIVE_MODULES.map((module) => (
              <DropdownMenuItem
                key={module.name}
                render={<Link href={module.href!} />}
                aria-current={isActive(module.href!) ? "page" : undefined}
                className={
                  isActive(module.href!)
                    ? "relative bg-neutral-bg font-medium text-move-navy after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-move-green"
                    : undefined
                }
              >
                {module.name}
              </DropdownMenuItem>
            ))}
            {COMING_SOON.map((module) => (
              <DropdownMenuItem
                key={module.name}
                disabled
                className="justify-between text-neutral-muted data-disabled:opacity-100"
              >
                {module.name}
                <SoonTag />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
