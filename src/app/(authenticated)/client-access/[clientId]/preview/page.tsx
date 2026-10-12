import { PortalHome } from "@/components/client-portal/portal-home";
import { utcToday } from "@/lib/client-updates/dates";
import { loadPortal } from "@/lib/client-updates/load-portal";
import { loadPreviewClient } from "./load-preview-client";
import { PreviewBanner } from "./preview-banner";

// Staff "View as client": the client's portal, from the same SQL
// (portal_updates_for_client wraps the query my_portal_updates uses) and the
// same components. No client session, no actions.
export default async function ViewAsClientPage({ params }: PageProps<"/client-access/[clientId]/preview">) {
  const { clientId } = await params;
  const { supabase, client } = await loadPreviewClient(clientId);
  const data = await loadPortal(supabase, { as: "staff", clientId: client.id });
  const base = `/client-access/${client.id}/preview`;
  return (
    <div className="bg-neutral-bg px-8 py-10 max-sm:px-4">
      <PreviewBanner clientName={client.name} />
      <PortalHome data={data} today={utcToday()} greetingName={null} summaryHref={base} reportHref={`${base}/market-report`} />
    </div>
  );
}
