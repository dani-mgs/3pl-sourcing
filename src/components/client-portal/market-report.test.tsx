import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureReport } from "@/lib/client-updates/__fixtures__/market-report";
import { FORWARDERS } from "@/lib/client-updates/__fixtures__/sources";
import { MarketReportView } from "./market-report";
import { MarketReportPageBody } from "./market-report-page";

// The paid Market Report as HTML, and the locked page as HTML.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("MarketReportView", () => {
  const html = renderToStaticMarkup(<MarketReportView payload={fixtureReport()} publishedAt="2026-10-10T10:00:00Z" />);
  const t = text(html);

  test("the four market figures, the distribution and what happened to all 12", () => {
    expect(t).toMatch(/Forwarders contacted 12 8 gave a price we could use\./);
    expect(t).toMatch(/Like-for-like quotes 6 Same terms as yours\. 2 other quotes aren't comparable\./);
    expect(t).toContain("$9,000–$10,600");
    expect(t).toContain("Middle of the market (median): $9,610.");
    expect(t).toMatch(/What you pay today \$10,000 More than 4 of the 6 comparable quotes\./);
    expect(t).toContain("You're paying above the middle of the market");
    expect(t).toContain("Not on this scale: Partner G ($8,700) and Partner H ($8,950).");
    expect(t).toContain("What happened to all 12 forwarders");
    expect(t).toMatch(/Not taken forward 4 /);
    expect(t).toContain("All 12");
    expect(t).toContain("Like-for-like only (6)");
  });

  test("Not taken forward rows: letter, profile and outcome only", () => {
    const row = /<tr[^>]*><th scope="row"[^>]*>Partner I<\/th>(.*?)<\/tr>/.exec(html)![1];
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
    expect(cells).toEqual(["Large · Southeast Asia", "—", "—", "—", "—", "Not taken forward"]);
  });

  test("nothing internal: only the shortlist named, no status words, no dates or terms of partners, no ids", () => {
    for (const f of FORWARDERS.slice(3)) expect(html, f.name).not.toContain(f.name);
    expect(html).not.toMatch(/Unfit|Do Not Contact|Withdrawn|No Response|Vetted|Under Assessment|Move Recommended/);
    expect(html).not.toMatch(/DDU|INTERNAL-CANARY|zzleak/i);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });
});

describe("MarketReportPageBody", () => {
  test("free plan: the locked page has no figures at all", () => {
    const t = text(renderToStaticMarkup(<MarketReportPageBody choice={{ kind: "locked" }} summaryHref="/portal" reportHref="/portal/market-report" />));
    expect(t).toContain("Locked · paid plan");
    expect(t).not.toMatch(/\$|\d|Partner [A-Z]/);
  });

  test("paid plan, nothing published: being prepared, no figures", () => {
    const t = text(renderToStaticMarkup(<MarketReportPageBody choice={{ kind: "preparing" }} summaryHref="/portal" reportHref="/portal/market-report" />));
    expect(t).toContain("Your Market Report is being prepared.");
    expect(t).not.toMatch(/\$|\d/);
  });

  test("an unreadable report says so, never shows raw data", () => {
    const t = text(
      renderToStaticMarkup(
        <MarketReportPageBody
          choice={{ kind: "report", entry: { key: "k", publishedAt: "2026-10-10T10:00:00Z", payload: null } }}
          summaryHref="/portal"
          reportHref="/portal/market-report"
        />,
      ),
    );
    expect(t).toContain("This report can't be shown.");
  });
});
