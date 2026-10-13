import { notFound } from "next/navigation";
import { MarketReportPageBody } from "@/components/client-portal/market-report-page";
import { chooseReport, loadMarketReports } from "@/lib/client-updates/load-market-reports";
import { loadPreviewClient } from "../load-preview-client";
import { PreviewBanner } from "../preview-banner";

// Exactly the client's Market Report page: the same loader and SQL
// (market_reports_for_client), so a free or expired client shows locked.
export default async function ViewAsClientMarketReportPage({
  params,
  searchParams,
}: PageProps<"/client-access/[clientId]/preview/market-report">) {
  const { clientId } = await params;
  const { p } = await searchParams;
  const { supabase, client } = await loadPreviewClient(clientId);
  const load = await loadMarketReports(supabase, { as: "staff", clientId: client.id });
  const choice = chooseReport(load, typeof p === "string" ? p : null);
  if (choice.kind === "not_found") notFound();
  const base = `/client-access/${client.id}/preview`;
  return (
    <div className="bg-neutral-bg px-8 py-10 max-sm:px-4">
      <PreviewBanner clientName={client.name} />
      <MarketReportPageBody choice={choice} summaryHref={base} reportHref={`${base}/market-report`} />
    </div>
  );
}
