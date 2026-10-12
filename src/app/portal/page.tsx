import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { PortalHome } from "@/components/client-portal/portal-home";
import { utcToday } from "@/lib/client-updates/dates";
import { loadPortal } from "@/lib/client-updates/load-portal";

// The client's Move summary: only their own client's published updates,
// read through my_portal_updates() (client_updates itself stays staff-only).
export default async function PortalHomePage() {
  const { firstName } = await requireClient();
  const supabase = await createClient();
  const data = await loadPortal(supabase, { as: "client" });
  return (
    <PortalHome
      data={data}
      today={utcToday()}
      greetingName={firstName?.split(/\s+/)[0] ?? null}
      summaryHref="/portal"
      reportHref="/portal/market-report"
    />
  );
}
