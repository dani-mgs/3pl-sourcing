import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { MarketReportPlaceholder } from "@/components/client-portal/portal-home";
import { effectiveTier } from "@/lib/client-tiers";

// Until Phase 2c: static text. It reads only the client's own plan row (to
// choose the locked or "being prepared" text), never any report data.
export default async function PortalMarketReportPage() {
  await requireClient();
  const supabase = await createClient();
  const { data: entitlement } = await supabase.from("client_entitlements").select("tier, valid_until").maybeSingle();
  return <MarketReportPlaceholder tier={effectiveTier(entitlement)} summaryHref="/portal" reportHref="/portal/market-report" />;
}
