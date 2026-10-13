import { MarketReportPublishPage } from "../../../market-reports/publish-page";

export default async function ForwarderMarketReportPage({ params }: PageProps<"/forwarder-sourcing/[id]/market-report">) {
  const { id } = await params;
  return <MarketReportPublishPage projectId={id} />;
}
