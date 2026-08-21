import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";
import { SidebarNav } from "./sidebar-nav";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-move-navy pt-6">
        <div className="p-6">
          <Link href="/dashboard" className="text-lg font-semibold text-white">
            3PL Sourcing
          </Link>
        </div>

        <SidebarNav />

        <div className="mt-auto p-6">
          <p className="mb-3 truncate text-xs text-white/60">{user?.email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-xl border border-white px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Log Out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 bg-neutral-bg">{children}</main>
    </div>
  );
}
