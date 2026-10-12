import { MarketReportPlaceholder } from "@/components/client-portal/portal-home";
import { effectiveTier } from "@/lib/client-tiers";
import { loadPreviewClient } from "../load-preview-client";
import { PreviewBanner } from "../preview-banner";

export default async function ViewAsClientMarketReportPage({ params }: PageProps<"/client-access/[clientId]/preview/market-report">) {
  const { clientId } = await params;
  const { supabase, client } = await loadPreviewClient(clientId);
  const { data: entitlement } = await supabase
    .from("client_entitlements")
    .select("tier, valid_until")
    .eq("client_id", client.id)
    .maybeSingle();
  const base = `/client-access/${client.id}/preview`;
  return (
    <div className="bg-neutral-bg px-8 py-10 max-sm:px-4">
      <PreviewBanner clientName={client.name} />
      <MarketReportPlaceholder tier={effectiveTier(entitlement)} summaryHref={base} reportHref={`${base}/market-report`} />
    </div>
  );
}
