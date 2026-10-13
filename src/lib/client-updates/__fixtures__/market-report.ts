import { anonymisedOrder, buildMarketReport, planMarketReport } from "../build-market-report";
import { toForwarderSource } from "../load-publish-source";
import { provisionalLabels } from "../market-report-labels";
import type { ReportInputs } from "../market-report-inputs";
import type { MarketReportPayload } from "../market-report-schema";
import { FORWARDERS, TODAY, forwarderId, forwarderProjectRow, forwarderRows, quoteRows } from "./sources";

// A Brightline-like Market Report built through the real builder from the
// fixture rows: 3 named, Partner D-H quoted, Partner I-L not taken forward.
export function fixtureReport(): MarketReportPayload {
  const source = toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows());
  const partners: ReportInputs["partners"] = {};
  FORWARDERS.forEach((_, i) => {
    partners[forwarderId(i)] = { size: i % 2 ? "mid_size" : "large", region: "southeast_asia", take: i < 8 ? `Comment ${i}` : null };
  });
  const order = anonymisedOrder(planMarketReport(source, forwarderId(0), TODAY));
  const result = buildMarketReport(
    source,
    { recommendedId: forwarderId(0), partners },
    provisionalLabels({ byForwarder: new Map(), used: 0 }, order),
    { authorFirstName: "Beah" },
    TODAY,
  );
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}
