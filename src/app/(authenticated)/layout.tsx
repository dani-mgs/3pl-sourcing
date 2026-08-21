import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";
import { SidebarNav } from "./sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

function getDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null): string {
  const firstName = user?.user_metadata?.first_name;
  if (typeof firstName === "string" && firstName.trim()) {
    return firstName.trim();
  }

  const localPart = user?.email?.split("@")[0];
  if (!localPart) {
    return "";
  }

  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = getDisplayName(user);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar collapsible="none" className="border-r-0">
        <SidebarHeader className="p-6">
          <Link
            href="/dashboard"
            className="font-display text-lg font-semibold text-sidebar-foreground"
          >
            3PL Sourcing
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-3">
          <SidebarNav />
        </SidebarContent>

        <SidebarFooter className="p-6">
          <p className="mb-3 truncate text-xs text-sidebar-foreground/60">
            {displayName}
          </p>
          <form action={logout}>
            <Button
              type="submit"
              variant="outline"
              className="w-full justify-center border-sidebar-foreground/30 bg-transparent text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
            >
              Log Out
            </Button>
          </form>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-y-auto">{children}</SidebarInset>
    </SidebarProvider>
  );
}
