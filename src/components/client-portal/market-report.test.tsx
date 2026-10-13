import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureReport } from "@/lib/client-updates/__fixtures__/market-report";
import { FORWARDERS } from "@/lib/client-updates/__fixtures__/sources";
import type { ClientRequestView } from "@/lib/client-requests/requests";
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
    const t = text(renderToStaticMarkup(<MarketReportPageBody choice={{ kind: "locked", interest: null }} summaryHref="/portal" reportHref="/portal/market-report" />));
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

function request(over: Partial<ClientRequestView>): ClientRequestView {
  return {
    key: "r1",
    engagementKey: "k-fwd",
    updateKey: null,
    projectKind: "forwarder",
    kind: "introduction",
    message: null,
    wantsCall: false,
    status: "sent",
    createdAt: "2026-10-11T09:00:00Z",
    from: "Maya",
    decisionName: null,
    reply: null,
    repliedAt: null,
    replier: null,
    replyWithdrawn: false,
    partnerLabel: "Partner D",
    ...over,
  };
}

// The Introduction cell of the row whose first cell is `name`.
function introCell(html: string, name: string): string {
  const row = new RegExp(`<tr[^>]*><th scope="row"[^>]*>${name}</th>(.*?)</tr>`).exec(html)![1];
  const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
  return text(cells[cells.length - 1]).trim();
}

describe("introductions on the report (Phase 3b)", () => {
  const render = (mode: "client" | "view", requests: ClientRequestView[] = []) =>
    renderToStaticMarkup(
      <MarketReportView
        payload={fixtureReport()}
        publishedAt="2026-10-10T10:00:00Z"
        introductions={{ engagementKey: "k-fwd", mode, requests }}
      />,
    );

  test("client: a Request introduction button on quoted lettered rows only", () => {
    const html = render("client", [request({}), request({ key: "other", engagementKey: "k-other", partnerLabel: "Partner E" })]);
    expect(html).toContain("<th scope=\"col\" class=\"px-3 py-2 font-semibold\">Introduction</th>");
    expect(introCell(html, "Partner D")).toBe("Introduction requested Sent · Maya");
    for (const letter of ["E", "F", "G", "H"]) expect(introCell(html, `Partner ${letter}`)).toBe("Request introduction");
    for (const letter of ["I", "J", "K", "L"]) expect(introCell(html, `Partner ${letter}`)).toBe("—");
    expect(introCell(html, "Pacific Bridge Logistics")).toBe("—");
    expect(html).toContain('aria-label="Request introduction to Partner E"');
  });

  test("an answered request shows its status; nothing about the partner beyond the letter", () => {
    const html = render("client", [request({ status: "answered", reply: "We emailed you both." })]);
    expect(introCell(html, "Partner D")).toBe("Introduction requested Answered · Maya");
    for (const f of FORWARDERS.slice(3)) expect(html, f.name).not.toContain(f.name);
  });

  test("View as client: what was asked, and no buttons", () => {
    const html = render("view", [request({})]);
    expect(introCell(html, "Partner D")).toBe("Introduction requested Sent · Maya");
    expect(introCell(html, "Partner E")).toBe("Client sees: Request introduction");
    expect(html).not.toMatch(/<button[^>]*>Request introduction/);
  });

  test("the publish preview (no introductions passed) has no Introduction column", () => {
    expect(renderToStaticMarkup(<MarketReportView payload={fixtureReport()} publishedAt={null} />)).not.toContain(">Introduction</th>");
  });

  // Phones (below md): stacked cards instead of the table, so Request
  // introduction isn't off-screen at 390px. CSS picks one; both are in the HTML.
  const cardList = (html: string) => /<ul id="[^"]*-cards"[^>]*>(.*?)<\/ul>/.exec(html)!;
  const cards = (html: string) => [...cardList(html)[1].matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
  const card = (html: string, name: string) => cards(html).find((c) => c.includes(`>${name}</h4>`))!;

  test("phones: cards below md, the table from md up", () => {
    const html = render("client");
    expect(cardList(html)[0]).toMatch(/class="[^"]*\bmd:hidden\b/);
    expect(html).toMatch(/<div class="[^"]*\bhidden\b[^"]*\bmd:block\b[^"]*"><table/);
    expect(cards(html)).toHaveLength(12);
  });

  test("phones: a full-width Request introduction button on every card the table offers one", () => {
    const html = render("client", [request({})]);
    for (const letter of ["E", "F", "G", "H"]) {
      const c = card(html, `Partner ${letter}`);
      expect(c).toMatch(/\[&amp;&gt;button\]:w-full/);
      expect(c).toContain(`aria-label="Request introduction to Partner ${letter}"`);
    }
    expect(text(card(html, "Partner D"))).toContain("Introduction requested Sent · Maya");
    for (const name of ["Partner I", "Pacific Bridge Logistics"]) expect(card(html, name)).not.toContain("<button");
  });

  test("phones: each card shows exactly its table row's fields", () => {
    const html = render("client", [request({})]);
    for (const c of cards(html)) {
      const name = /<h4[^>]*>(.*?)<\/h4>/.exec(c)![1];
      const row = new RegExp(`<tr[^>]*><th scope="row"[^>]*>${name}</th>(.*?)</tr>`).exec(html)![1];
      const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => text(m[1]).trim());
      const values = [...c.matchAll(/<dd[^>]*>(.*?)<\/dd>/g)].map((m) => text(m[1]).trim());
      // Table: profile, price, vs, transit, take, outcome, introduction.
      expect(values, name).toEqual(cells.slice(0, 5));
      expect(text(c), name).toContain(cells[5]);
      expect(text(c).trim().endsWith(cells[6]), name).toBe(true);
    }
  });

  test("phones, View as client: what the client sees, and no buttons", () => {
    const html = render("view", [request({})]);
    expect(text(card(html, "Partner E"))).toContain("Client sees: Request introduction");
    expect(cardList(html)[1]).not.toContain("<button");
  });
});

describe("Unlock the Market Report (Phase 3b)", () => {
  const locked = (interest: ClientRequestView | null, mode: "client" | "view" = "client") =>
    text(
      renderToStaticMarkup(
        <MarketReportPageBody choice={{ kind: "locked", interest }} summaryHref="/portal" reportHref="/portal/market-report" mode={mode} />,
      ),
    );
  const interest = request({ kind: "report_interest", engagementKey: null, projectKind: null, partnerLabel: null, from: "You" });

  test("the client sees the button, with no price and no letters", () => {
    const t = locked(null);
    expect(t).toContain("Unlock the Market Report");
    expect(t).not.toMatch(/\$|\d|Partner [A-Z]/);
  });

  test("once asked: when, by whom and the status, not the button", () => {
    const t = locked(interest);
    expect(t).toMatch(/You asked about the Market Report on .* \(you\)\. Status: Sent\./);
    expect(t).not.toMatch(/<button/);
    expect(locked({ ...interest, status: "answered", reply: "I'll call you on Monday.", replier: "Priya" })).toContain(
      "I'll call you on Monday. Priya, Move",
    );
  });

  test("View as client: no button", () => {
    const html = renderToStaticMarkup(
      <MarketReportPageBody choice={{ kind: "locked", interest: null }} summaryHref="/x" reportHref="/x/market-report" mode="view" />,
    );
    expect(html).not.toContain("<button");
    expect(text(html)).toContain("Here the client sees Unlock the Market Report.");
  });
});
