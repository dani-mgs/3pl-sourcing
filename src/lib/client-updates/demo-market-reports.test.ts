import { describe, expect, test } from "vitest";
import { demoMarketReports, OLD_REPORT_CANARY, REPORT_CANARY } from "../../../scripts/qa/demo-portal-data.mjs";
import { findIdentifying, type PartnerIdentity } from "./market-report-guard";
import { marketReportPayloadSchema, type MarketReportPayload } from "./market-report-schema";
import { partnerName } from "./market-report-view";
import { fixtureReport } from "./__fixtures__/market-report";

// The demo seed's Market Reports are hand-written (the seed can't run the
// TypeScript builders). This keeps them honest: every payload passes the
// strict schema, the Brightline rows equal what the builder makes from the
// same forwarders, the letters run D onwards with no gaps, and every
// "Move's take" passes the guard against every forwarder in its project.

type DemoPartner = { name: string; hq: string; label: string | null; row: MarketReportPayload["partners"][number] };
type DemoReport = { engagement: string; daysAgo: number; recommended: string | null; partners: DemoPartner[]; payload: unknown };

const reports = demoMarketReports() as DemoReport[];

// As the demo seed stores forwarders (seed-demo.mjs, forwarder()).
function identity(p: DemoPartner, i: number): PartnerIdentity {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return { id: String(i), company_name: p.name, website: `https://www.${slug}.example`, headquarters: p.hq, email: `ocean@${slug}.example`, contact_person: "Ocean sales desk" };
}

describe("demo seed Market Reports", () => {
  test.each(reports.map((r) => [`${r.engagement} ${r.daysAgo}d ago`, r] as const))("%s passes the strict schema", (_label, r) => {
    const result = marketReportPayloadSchema.safeParse(r.payload);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  test.each(reports.map((r) => [`${r.engagement} ${r.daysAgo}d ago`, r] as const))("%s: letters D onwards, names only for the shortlist", (_label, r) => {
    const letters = r.partners.filter((p) => p.label).map((p) => p.label);
    expect(letters).toEqual(letters.map((_, i) => String.fromCharCode(68 + i)));
    for (const p of r.partners) {
      expect(partnerName(p.row)).toBe(p.label ? `Partner ${p.label}` : p.name);
    }
  });

  test.each(reports.map((r) => [`${r.engagement} ${r.daysAgo}d ago`, r] as const))("%s: every Move's take passes the guard", (_label, r) => {
    const identities = r.partners.map(identity);
    for (const p of r.partners) {
      if (p.row.outcome === "not_taken_forward") continue;
      if (p.row.take) expect(findIdentifying(p.row.take, identities), p.row.take).toBeNull();
    }
  });

  test("the current Brightline report equals what the builder makes from the same forwarders", () => {
    const current = reports.filter((r) => r.engagement === "brightlineFwd").sort((a, b) => a.daysAgo - b.daysAgo)[0];
    const pick = (p: MarketReportPayload["partners"][number]) => [
      partnerName(p),
      p.outcome,
      "priceUsd" in p ? p.priceUsd : null,
      "likeForLike" in p ? p.likeForLike : null,
    ];
    expect((current.payload as MarketReportPayload).partners.map(pick)).toEqual(fixtureReport().partners.map(pick));
  });

  test("canaries: the old Brightline report and Ridgeway's (free plan) carry one each", () => {
    const json = (engagement: string, days: number) =>
      JSON.stringify(reports.find((r) => r.engagement === engagement && r.daysAgo === days)!.payload);
    expect(json("brightlineFwd", 9)).toContain(OLD_REPORT_CANARY);
    expect(json("brightlineFwd", 2)).not.toContain("CANARY");
    expect(json("ridgewayFwd", 4)).toContain(REPORT_CANARY);
  });
});
