import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { toPortalData } from "@/lib/client-updates/portal-data";
import type { PortalLoad } from "@/lib/client-updates/load-portal";
import { CLIENT_ENGAGEMENTS, DRAFT_CANARY, rowsFor } from "@/lib/client-updates/__fixtures__/portal-rows";
import { TODAY } from "@/lib/client-updates/__fixtures__/sources";
import type { ClientRequestView } from "@/lib/client-requests/requests";
import { MarketReportPlaceholder, PortalHome, type PortalMode } from "./portal-home";

// The portal as HTML for each demo client (free and paid), built from the
// demo seed's published updates.

const CLIENT_NAMES = [
  "Northwind Coffee Roasters",
  "Brightline Apparel",
  "Kettle & Pine Home",
  "Solace Skincare",
  "Ridgeway Outdoor",
  "Harbor Pet Supply",
];
// Partners the demo never shortlisted (and the ones ruled out internally).
const NEVER_NAMED = ["Meridian Ocean", "Redwood Gateway", "Swift Tide", "Golden Lantern", "Anchor Point", "QuickShip", "Northstar", "Atlantic Pick"];
const STATUS_WORDS = /Unfit|Do Not Contact|Do not Contact|Withdrawn|No Response|Vetted|Under Assessment|Move Recommended|Reviewing Quotation/;

function render(
  client: string,
  tier: PortalLoad["tier"] = "free",
  rows = rowsFor(client),
  reportKeys: string[] = [],
  requests: ClientRequestView[] = [],
  mode: PortalMode = "client",
) {
  const data: PortalLoad = { ...toPortalData(rows), tier, contactNames: ["Alex"], reportKeys, requests };
  return renderToStaticMarkup(
    <PortalHome data={data} today={TODAY} greetingName="Lena" summaryHref="/portal" reportHref="/portal/market-report" mode={mode} />,
  );
}

function request(over: Partial<ClientRequestView>): ClientRequestView {
  return {
    key: "r1",
    engagementKey: "key-brightlineFwd",
    updateKey: null,
    projectKind: "forwarder",
    kind: "question",
    message: "A question",
    wantsCall: false,
    status: "sent",
    createdAt: "2026-10-11T09:00:00Z",
    from: "You",
    decisionName: null,
    reply: null,
    repliedAt: null,
    replier: null,
    replyWithdrawn: false,
    ...over,
  };
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("PortalHome", () => {
  test("Brightline: needs-you banner, key figures, tiles as buttons, both projects labelled, timeline", () => {
    const html = render("brightline", "market_report");
    const t = text(html);
    expect(t).toContain("1 item needs you");
    expect(t).toContain("Your decision, by Oct 17 (your freight forwarder project)");
    expect(t).toMatch(/Active projects 2 /);
    expect(t).toMatch(/Waiting on you 1 /);
    expect(t).toMatch(/Partners contacted 21 /);
    expect(t).toContain("10% below");
    expect((html.match(/aria-pressed="(true|false)" aria-controls="portal-panel"/g) ?? []).length).toBe(2);
    expect(t).toContain("Freight forwarder project · Ho Chi Minh City → Los Angeles");
    expect(t).toContain("Warehouse (3PL) project · US West Coast");
    expect(t).toContain("Timeline across your projects");
    expect(t).toContain("Market Report (your plan)");
    expect(t).toContain("Your Market Report for this project is being prepared.");
    // The client's own portal: the three actions on the latest recommendation.
    expect(t).toContain("Approve recommendation Request changes Ask a question");
  });

  test("View as client: no buttons and no forms, only what the client would see", () => {
    const html = render("brightline", "market_report", rowsFor("brightline"), [], [], "view");
    expect(html).not.toMatch(/<button[^>]*>(Approve recommendation|Request changes|Ask a question|New question)/);
    expect(html).not.toMatch(/<form|<textarea/);
    expect(text(html)).toContain("Here the client sees Approve recommendation, Request changes and Ask a question.");
  });

  test("after a decision on the latest update: who and when, no buttons, and it no longer needs the client", () => {
    const approval = request({ kind: "approve", updateKey: "ukey-brightlineFwd-3", message: "Start after the 20th", decisionName: "Pacific Bridge Logistics", from: "Maya" });
    const html = render("brightline", "market_report", rowsFor("brightline"), [], [approval]);
    const t = text(html);
    expect(t).toMatch(/Approved .* by Maya\. Note: Start after the 20th Status: Sent/);
    expect(t).not.toContain("Approve recommendation Request changes");
    expect(t).not.toContain("1 item needs you");
    expect(t).toMatch(/Waiting on you 0 /);
    // The viewer's own decision reads "by you" mid-sentence.
    const mine = text(render("brightline", "market_report", rowsFor("brightline"), [], [{ ...approval, from: "You" }]));
    expect(mine).toMatch(/Approved .* by you\./);
  });

  test("a decision on an older update doesn't count: the latest still needs the client", () => {
    const old = request({ kind: "request_changes", updateKey: "ukey-brightlineFwd-12", message: "West Coast option" });
    const t = text(render("brightline", "market_report", rowsFor("brightline"), [], [old]));
    expect(t).toContain("1 item needs you");
    expect(t).toContain("Approve recommendation Request changes Ask a question");
  });

  test("Your questions: status, who sent it, Move's reply, and a withdrawn reply without its text", () => {
    const answered = request({ key: "a", message: "Weekend delivery to Ontario?", status: "answered", reply: "Yes, +$150.", replier: "Alex", from: "You", wantsCall: true });
    const withdrawn = request({ key: "b", message: "Insurance?", status: "seen", replyWithdrawn: true, from: "Owen" });
    const t = text(render("brightline", "market_report", rowsFor("brightline"), [], [answered, withdrawn]));
    expect(t).toContain("Weekend delivery to Ontario?");
    expect(t).toContain("Answered");
    expect(t).toMatch(/You · .* · Asked for a call/);
    expect(t).toContain("Yes, +$150. Alex, Move");
    expect(t).toContain("Seen by Move");
    expect(t).toMatch(/Owen · /);
    expect(t).toContain("Move withdrew this reply; a new one is coming.");
  });

  test("paid plan with a published report: the teaser links to that project's report by its opaque key", () => {
    const html = render("brightline", "market_report", rowsFor("brightline"), ["key-brightlineFwd"]);
    const t = text(html);
    expect(t).toContain("Your Market Report for this project is ready");
    expect(html).toContain('href="/portal/market-report?p=key-brightlineFwd"');
  });

  test("free plan: the Market Report is locked and the teaser has no figures", () => {
    const t = text(render("ridgeway"));
    expect(t).toContain("Market Report (paid, locked)");
    expect(t).toContain("Part of the paid Market Report.");
  });

  test.each(Object.keys(CLIENT_ENGAGEMENTS))("%s: nothing internal, no draft, no other client", (client) => {
    const html = render(client);
    expect(html).not.toContain("INTERNAL-CANARY");
    expect(html).not.toContain(DRAFT_CANARY);
    expect(html).not.toMatch(STATUS_WORDS);
    for (const name of NEVER_NAMED) expect(html).not.toContain(name);
    for (const name of CLIENT_NAMES) expect(html).not.toContain(name);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });

  test("nothing published yet: the getting-started state with the Move contact's first name", () => {
    const t = text(render("solace", "free", []));
    expect(t).toContain("Your Move team is getting started.");
    expect(t).toContain("Your first update will appear here soon.");
    expect(t).toContain("Your Move contact: Alex");
  });

  test("completed projects sit under Completed", () => {
    const t = text(render("harbor"));
    expect(t).toContain("Completed");
    expect(t).toContain("✓ Complete");
    expect(t).toContain("Nothing needs you right now.");
  });
});

describe("MarketReportPlaceholder", () => {
  test.each(["free", "market_report"] as const)("%s: static text, no figures", (tier) => {
    const t = text(renderToStaticMarkup(<MarketReportPlaceholder tier={tier} summaryHref="/portal" reportHref="/portal/market-report" />));
    expect(t).not.toMatch(/\$|\d/);
    expect(t).toContain(tier === "free" ? "Locked · paid plan" : "Your Market Report is being prepared.");
  });
});
