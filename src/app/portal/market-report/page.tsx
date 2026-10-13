import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { MarketReportPageBody } from "@/components/client-portal/market-report-page";
import { chooseReport, loadMarketReports } from "@/lib/client-updates/load-market-reports";

// The client's Market Report. On the free plan this is static text: only the
// client's own plan row is read. On the paid plan the report comes from
// my_market_reports() (latest per project, only while the plan is paid);
// ?p= is the project's opaque portal key, and any other key is a 404.
export default async function PortalMarketReportPage({ searchParams }: PageProps<"/portal/market-report">) {
  await requireClient();
  const { p } = await searchParams;
  const supabase = await createClient();
  const load = await loadMarketReports(supabase, { as: "client" });
  const choice = chooseReport(load, typeof p === "string" ? p : null);
  if (choice.kind === "not_found") notFound();
  return <MarketReportPageBody choice={choice} summaryHref="/portal" reportHref="/portal/market-report" />;
}
