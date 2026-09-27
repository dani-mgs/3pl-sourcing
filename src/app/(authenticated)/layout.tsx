import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { Greeting } from "./greeting";
import { UserMenu } from "./user-menu";
import { ModuleNav } from "./module-nav";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/modules";

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
      <header className="sticky top-0 z-40 flex h-16 items-center gap-6 bg-move-navy px-8">
        <Link
          href="/"
          aria-label={APP_NAME}
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="size-3 rounded-sm bg-move-green" />
          <span
            aria-hidden="true"
            className="font-display text-lg font-semibold whitespace-nowrap text-white"
          >
            <span className="hidden xl:max-[1759px]:inline">{APP_SHORT_NAME}</span>
            <span className="xl:max-[1759px]:hidden">{APP_NAME}</span>
          </span>
        </Link>

        <ModuleNav />

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <Greeting displayName={displayName} />
          <UserMenu displayName={displayName} isAdmin={role === "admin"} />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
