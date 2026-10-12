import Link from "next/link";
import { requireClient } from "@/lib/auth/require-client";
import { logout } from "@/app/logout/actions";

// The client portal: its own minimal layout, no staff navigation. Only client
// users get here (the proxy sends everyone else a 404, and requireClient()
// checks again).
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { firstName, mustChangePassword } = await requireClient();

  return (
    <div className="flex min-h-svh flex-col bg-neutral-bg">
      <header className="flex h-16 items-center justify-between gap-4 bg-move-navy px-8 max-sm:px-4">
        <span className="flex items-center gap-2.5 font-display text-lg font-semibold whitespace-nowrap text-white">
          <span className="size-3 rounded-sm bg-move-green" />
          MOVE
          <span className="text-sm font-medium text-white/80">Client portal</span>
        </span>
        <div className="flex items-center gap-3 text-sm text-white">
          {firstName && <span className="max-sm:hidden">{firstName}</span>}
          {!mustChangePassword && (
            <Link href="/portal/change-password" className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white">
              Password
            </Link>
          )}
          <form action={logout}>
            <button type="submit" className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-8 py-10 max-sm:px-4">{children}</main>
    </div>
  );
}
