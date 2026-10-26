import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { UserMenu } from "./user-menu";
import { HelpLink } from "./help-link";
import { RequestsLink } from "./requests-link";
import { ModuleNav } from "./module-nav";
import { APP_NAME, APP_SHORT_NAME, hubModules } from "@/lib/modules";
import { isLandedCostEnabled } from "@/lib/landed-cost/feature-flag";
import { isForwarderAuditEnabled } from "@/lib/forwarder-audit/feature-flag";

// The name is in app_metadata (set by admins only), never user_metadata.
function getDisplayName(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
} | null): string {
  const firstName = user?.app_metadata?.first_name;
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
  // Client users never see staff pages. The proxy already sends them to
  // /portal; this is the second layer, in case a route slips past it.
  if (role === "client") notFound();
  // Unseen client requests on the caller's projects (all for admins).
  const { data: badge } = role ? await supabase.rpc("my_client_request_badge") : { data: 0 };

  return (
    <div className="min-h-svh bg-neutral-bg">
      <header className="print:hidden sticky top-0 z-40 flex h-16 items-center gap-6 bg-move-navy px-8 max-sm:gap-4 max-sm:px-4">
        <Link
          href="/"
          aria-label={APP_NAME}
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="size-3 rounded-sm bg-move-green" />
          {/* Mark only below sm (the link keeps its aria-label), the short
              name up to 1759px, the full name above. */}
          <span
            aria-hidden="true"
            className="font-display text-lg font-semibold whitespace-nowrap text-white max-sm:hidden"
          >
            <span className="min-[1760px]:hidden">{APP_SHORT_NAME}</span>
            <span className="hidden min-[1760px]:inline">{APP_NAME}</span>
          </span>
        </Link>

        <ModuleNav modules={hubModules(isLandedCostEnabled(), isForwarderAuditEnabled())} />

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {role && <RequestsLink count={typeof badge === "number" ? badge : 0} />}
          <HelpLink />
          <UserMenu displayName={displayName} isAdmin={role === "admin"} />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
