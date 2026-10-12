import { describe, expect, test } from "vitest";
import { buildForwarderPayload } from "./build-forwarder-payload";
import { toForwarderSource } from "./load-publish-source";
import type { ForwarderPayload } from "./payload-schema";
import {
  FORWARDERS,
  PEOPLE,
  TODAY,
  forwarderId,
  forwarderProjectRow,
  forwarderRows,
  inputs,
  quoteRows,
} from "./__fixtures__/sources";
import type { PublishInputs } from "./publish-inputs";

const SHORTLIST = [forwarderId(0), forwarderId(1), forwarderId(2)];

function build(
  overrides: Partial<PublishInputs> = {},
  project: Record<string, unknown> = {},
  list = FORWARDERS,
  today = TODAY,
): ForwarderPayload {
  const source = toForwarderSource(forwarderProjectRow(project), forwarderRows(list), quoteRows(list));
  const result = buildForwarderPayload(
    source,
    inputs({ partnerIds: SHORTLIST, recommendedId: forwarderId(0), ...overrides }),
    PEOPLE,
    today,
  );
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

describe("buildForwarderPayload", () => {
  test("Brightline-style project: counts, saving and FCR from the ranking gate", () => {
    const { comparison, funnel, recommendation, project } = build();
    // 12 contacted; 4 out of the running count as contacted only.
    expect(funnel).toEqual([
      { step: "contacted", count: 12 },
      { step: "quoted", count: 8 },
      { step: "like_for_like", count: 6 },
      { step: "shortlisted", count: 3 },
      { step: "recommended", count: 1 },
    ]);
    expect(comparison.counts).toEqual({ quoted: 8, likeForLike: 6, differentTerms: 2, expired: 0 });
    expect(comparison.options.map((o) => [o.name, o.role, o.costUsd, o.savingPct, o.fcrPct])).toEqual([
      ["Pacific Bridge Logistics", "recommended", 9000, 0.1, "15.0%"],
      ["Lotus Freight", "backup", 9420, 0.058, "15.7%"],
      ["Saigon Harbor Shipping", "backup", 9420, 0.058, "15.7%"],
    ]);
    expect(comparison.today).toEqual({ costUsd: 10000, leadTimeDays: 30, fcrPct: "16.7%" });
    // The Unfit forwarder's $8,300 quote is cheaper, but it's out of the running.
    expect(comparison.bestSaving).toEqual({ name: "Pacific Bridge Logistics", pct: 0.1, usd: 1000 });
    expect(comparison.annual).toBeNull();
    expect(recommendation?.name).toBe("Pacific Bridge Logistics");
    expect(project).toEqual({
      route: "Ho Chi Minh City → Los Angeles",
      facts: ["Sea freight, full container (FCL)", "Delivered duty paid (DDP)", "2 shipments a month", "12-month project"],
    });
  });

  test("annual savings only when the expert ticks it", () => {
    expect(build({ includeAnnual: true }).comparison.annual).toEqual({ savingUsd: 24000, shipmentsPerYear: 24 });
  });

  test("a shortlisted quote on different terms is shown greyed, never best, with no saving", () => {
    const list = FORWARDERS.map((f, i) =>
      i === 0 ? { ...f, quotes: [{ ...f.quotes[0], incoterm: "DAP", original_amount: 8000 }] } : f,
    );
    const { comparison } = build({}, {}, list);
    const pacific = comparison.options.find((o) => o.name === "Pacific Bridge Logistics")!;
    expect(pacific).toMatchObject({ comparability: "different_terms", costUsd: 8000, savingPct: null, savingUsd: null });
    expect(comparison.bestSaving?.name).toBe("Lotus Freight");
  });

  test("an expired quote is labelled and never best, even if it's the cheapest", () => {
    const { comparison } = build({}, {}, FORWARDERS, "2026-10-25");
    const pacific = comparison.options.find((o) => o.name === "Pacific Bridge Logistics")!;
    expect(pacific.comparability).toBe("like_for_like");
    // Day 22 after the fixture date: Saigon Harbor's quote (valid 9 days) has expired.
    const saigon = comparison.options.find((o) => o.name === "Saigon Harbor Shipping")!;
    expect(saigon).toMatchObject({ comparability: "expired", savingPct: null });
  });

  test("a quote valid until today is still like-for-like", () => {
    const { comparison } = build({}, {}, FORWARDERS, "2026-10-21");
    expect(comparison.options.find((o) => o.name === "Saigon Harbor Shipping")!.comparability).toBe("like_for_like");
  });

  test("fewer than 2 like-for-like quotes: no comparison chart, just counts", () => {
    const list = FORWARDERS.map((f, i) =>
      i >= 1 && i <= 5 ? { ...f, quotes: f.quotes.map((q) => ({ ...q, incoterm: "DAP" })) } : f,
    );
    const { comparison } = build({}, {}, list);
    expect(comparison.counts.likeForLike).toBe(1);
    expect(comparison.emptyCost).toBe("too_few");
    expect(comparison.show.cost).toBe(false);
    expect(comparison.options.every((o) => o.costUsd == null && o.savingPct == null)).toBe(true);
    expect(comparison.bestSaving).toBeNull();
    expect(comparison.today.costUsd).toBeNull();
  });

  test("only different-terms quotes: its own empty state", () => {
    const list = FORWARDERS.map((f) => ({ ...f, quotes: f.quotes.map((q) => ({ ...q, incoterm: "DAP" })) }));
    expect(build({}, {}, list).comparison.emptyCost).toBe("only_different_terms");
  });

  test("no baseline: prices still compare, savings are hidden", () => {
    const { comparison } = build({}, { current_freight_cost_usd: null });
    expect(comparison.show.cost).toBe(true);
    expect(comparison.savingsNote).toBe("no_baseline");
    expect(comparison.options.every((o) => o.savingPct == null)).toBe(true);
    expect(comparison.bestSaving).toBeNull();
  });

  test.each([
    [{ invoice_value: null }, "missing"],
    [{ invoice_currency: "EUR" }, "not_usd"],
  ])("FCR needs a USD invoice value (%o)", (project, issue) => {
    const { comparison } = build({}, project);
    expect(comparison.fcrIssue).toBe(issue);
    expect(comparison.today.fcrPct).toBeNull();
    expect(comparison.options.every((o) => o.fcrPct == null)).toBe(true);
  });

  test("unticked sections leave their figures out of the payload", () => {
    const { comparison, funnel } = build({
      sections: { funnel: false, cost: false, leadTime: false, fcr: false, validity: false },
    });
    expect(funnel).toBeNull();
    expect(comparison.show).toEqual({ cost: false, leadTime: false, fcr: false, validity: false });
    for (const o of comparison.options) {
      expect([o.costUsd, o.savingPct, o.savingUsd, o.leadMinDays, o.leadMaxDays, o.fcrPct, o.validUntil]).toEqual([
        null, null, null, null, null, null, null,
      ]);
    }
    expect(comparison.today).toEqual({ costUsd: null, leadTimeDays: null, fcrPct: null });
    expect(comparison.emptyCost).toBeNull();
  });

  test("only shortlisted partners can be named", () => {
    const source = toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows());
    for (const id of [forwarderId(3), forwarderId(8), "00000000-0000-4000-8000-00000000dead"]) {
      const result = buildForwarderPayload(source, inputs({ partnerIds: [...SHORTLIST, id] }), PEOPLE, TODAY);
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/Only shortlisted partners/) });
    }
  });

  test("no recommendation yet: no card, and the funnel says 0 recommended", () => {
    const payload = build({ recommendedId: null });
    expect(payload.recommendation).toBeNull();
    expect(payload.funnel?.at(-1)).toEqual({ step: "recommended", count: 0 });
    expect(payload.comparison.options.every((o) => o.role === "backup")).toBe(true);
  });

  test("the contact is the owner's first name plus the email typed on the form", () => {
    expect(build({ contactEmail: null }).contact).toEqual({ firstName: "Beah", email: null });
  });
});
