import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { buildForwarderPayload } from "@/lib/client-updates/build-forwarder-payload";
import { buildThreePlPayload } from "@/lib/client-updates/build-three-pl-payload";
import { toForwarderSource, toThreePlSource } from "@/lib/client-updates/load-publish-source";
import type { ClientUpdatePayload } from "@/lib/client-updates/payload-schema";
import type { PublishInputs } from "@/lib/client-updates/publish-inputs";
import {
  CANARY,
  FORWARDERS,
  PEOPLE,
  TODAY,
  forwarderId,
  forwarderProjectRow,
  forwarderRows,
  inputs,
  providerId,
  providerRows,
  quoteRows,
  recommendationRow,
  threePlProjectRow,
} from "@/lib/client-updates/__fixtures__/sources";
import { ProjectPanel } from "./project-panel";

// The panel as rendered HTML (what the preview, "View as client" and the
// portal show). Built from full database rows with INTERNAL-CANARY in every
// internal field.

function forwarderHtml(overrides: Partial<PublishInputs> = {}, project: Record<string, unknown> = {}) {
  const built = buildForwarderPayload(
    toForwarderSource(forwarderProjectRow(project), forwarderRows(), quoteRows()),
    inputs({ partnerIds: [forwarderId(0), forwarderId(1), forwarderId(2)], recommendedId: forwarderId(0), ...overrides }),
    PEOPLE,
    TODAY,
  );
  if (!built.ok) throw new Error(built.error);
  return render(built.payload);
}

function threePlHtml(overrides: Partial<PublishInputs> = {}) {
  const built = buildThreePlPayload(
    toThreePlSource(threePlProjectRow(), providerRows(), recommendationRow()),
    inputs({ partnerIds: [providerId(1), providerId(3), providerId(2)], recommendedId: providerId(1), ...overrides }),
    PEOPLE,
  );
  if (!built.ok) throw new Error(built.error);
  return render(built.payload);
}

function render(payload: ClientUpdatePayload, publishedAt: string | null = "2026-10-09T10:00:00Z") {
  return renderToStaticMarkup(
    <ProjectPanel
      today={TODAY}
      update={{
        stage: 5,
        headline: "Your recommendation is ready",
        summary: "We compared every like-for-like quote.",
        nextStep: "Your decision",
        nextStepDue: "2026-10-17",
        needsClientAction: true,
        publishedAt,
        payload,
      }}
    />,
  );
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("ProjectPanel", () => {
  test("a forwarder panel: labelled with its project everywhere, takeaway titles, table switches", () => {
    const html = forwarderHtml();
    const t = text(html);
    expect(t).toContain("Freight forwarder project");
    expect(t).toContain("Ho Chi Minh City → Los Angeles");
    expect(t).toContain("Stage 5 of 7 · Recommendation ready");
    expect(t).toContain("Freight per shipment: up to 10% below what you pay today");
    expect(t).toContain("16.7% → 15.0%");
    expect(t).toContain("Next: Your decision, by Oct 17");
    expect(t).toContain("Needs your input");
    expect(t).toContain("Move recommends");
    expect(t).toContain("Figures are estimates");
    expect(t).toContain("Updated Oct 9 by Beah, Move");
    expect(t).toContain("Your Move contact for this project: Beah · team@move.example");
    // Every chart can be switched to a table.
    const charts = (html.match(/<figure/g) ?? []).length;
    expect(charts).toBeGreaterThanOrEqual(3);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(charts);
    expect((html.match(/>Table</g) ?? []).length).toBe(charts);
    // No Phase 3 actions yet.
    expect(t).not.toMatch(/Approve recommendation|Request changes|Ask a question/);
  });

  test("a 3PL panel shows percentages against today's rate card, not amounts", () => {
    const t = text(threePlHtml());
    expect(t).toContain("Warehouse (3PL) project");
    expect(t).toContain("Harborline Fulfillment's rate card is 15.2% below today's");
    expect(t).toContain("It isn't a monthly bill: your final cost depends on your volumes.");
    expect(t).not.toMatch(/\$\d/);
  });

  test("empty states instead of charts drawn from too little data", () => {
    const empty = text(forwarderHtml({ partnerIds: [], recommendedId: null }, { final_incoterm: "DAP" }));
    expect(empty).toContain("The quotes so far use different delivery terms, so they can't be compared fairly yet.");
    expect(empty).toContain("Not ready yet.");
    expect(text(forwarderHtml({}, { invoice_currency: "EUR" }))).toContain("Shown once your invoice value is confirmed in US dollars.");
  });

  test("a preview says it isn't shared yet", () => {
    const built = buildForwarderPayload(
      toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows()),
      inputs({ partnerIds: [forwarderId(0)] }),
      PEOPLE,
      TODAY,
    );
    if (!built.ok) throw new Error(built.error);
    expect(text(render(built.payload, null))).toContain("Preview: not shared yet");
  });

  test("nothing internal in the rendered HTML", () => {
    for (const html of [forwarderHtml({ includeAnnual: true }), threePlHtml()]) {
      expect(html).not.toContain(CANARY);
      expect(html).not.toMatch(/zzleak|Unfit|Do Not Contact|Withdrawn|Vetted|Under Assessment|Move Recommended/i);
      for (const f of FORWARDERS.slice(3)) expect(html).not.toContain(f.name);
    }
  });
});
