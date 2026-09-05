import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { Greeting } from "./greeting";
import { UserMenu } from "./user-menu";

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
  const role = await getUserRole();

  return (
    <div className="min-h-svh bg-neutral-bg">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-move-navy px-8">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="size-3 rounded-sm bg-move-green" />
          <span className="font-display text-lg font-semibold text-white">
            3PL Sourcing
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Greeting displayName={displayName} />
          <UserMenu displayName={displayName} isAdmin={role === "admin"} />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
