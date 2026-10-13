import { describe, expect, test } from "vitest";
import { anonymisedOrder, buildMarketReport, planMarketReport, REPORT_NOT_SHORTLISTED } from "./build-market-report";
import { toForwarderSource } from "./load-publish-source";
import { labelAt, provisionalLabels, type StoredLabels } from "./market-report-labels";
import type { ReportInputs } from "./market-report-inputs";
import { isNotTakenForward, type MarketReportPayload } from "./market-report-schema";
import { offScaleText, partnerName, positionTitle, reportFigures, vsTodayText } from "./market-report-view";
import { FORWARDERS, TODAY, forwarderId, forwarderProjectRow, forwarderRows, quoteRows } from "./__fixtures__/sources";

// The fixture mirrors the Brightline demo: 12 forwarders contacted (plus one
// never contacted), 3 shortlisted, 3 more like-for-like, 2 on DDU terms, and
// 4 out of the running (Unfit, Do Not Contact, 2 Withdrawn / No Response).

const NO_LABELS: StoredLabels = { byForwarder: new Map(), used: 0 };

function source(list = FORWARDERS) {
  return toForwarderSource(forwarderProjectRow(), forwarderRows(list), quoteRows(list));
}

function everyPartner(take: string | null = "Solid on this lane"): ReportInputs {
  const partners: ReportInputs["partners"] = {};
  FORWARDERS.forEach((_, i) => {
    partners[forwarderId(i)] = { size: "large", region: "southeast_asia", take };
  });
  return { recommendedId: forwarderId(0), partners };
}

function build(inputs = everyPartner(), stored = NO_LABELS, list = FORWARDERS) {
  const s = source(list);
  const order = anonymisedOrder(planMarketReport(s, inputs.recommendedId, TODAY, stored.byForwarder));
  const labels = provisionalLabels(stored, order);
  const result = buildMarketReport(s, inputs, labels, { authorFirstName: "Beah Santos" }, TODAY);
  if (!result.ok) throw new Error(result.error);
  return { payload: result.payload, labels, order };
}

const rowsOf = (p: MarketReportPayload) => p.partners.map((r) => [partnerName(r), r.outcome]);

describe("buildMarketReport", () => {
  test("every contacted partner once: shortlist named, the rest Partner D-L, in the report's order", () => {
    const { payload } = build();
    expect(rowsOf(payload)).toEqual([
      ["Pacific Bridge Logistics", "recommended"],
      ["Lotus Freight", "shortlisted"],
      ["Saigon Harbor Shipping", "shortlisted"],
      ["Partner D", "quoted_not_selected"],
      ["Partner E", "quoted_not_selected"],
      ["Partner F", "quoted_not_selected"],
      ["Partner G", "different_terms"],
      ["Partner H", "different_terms"],
      ["Partner I", "not_taken_forward"],
      ["Partner J", "not_taken_forward"],
      ["Partner K", "not_taken_forward"],
      ["Partner L", "not_taken_forward"],
    ]);
    expect(payload.author.firstName).toBe("Beah");
    expect(payload.today.costUsd).toBe(10000);
    expect(payload.partners.find((p) => partnerName(p) === "Partner D")).toEqual({
      label: "Partner D",
      outcome: "quoted_not_selected",
      priceUsd: 9800,
      leadMinDays: null,
      leadMaxDays: null,
      likeForLike: true,
      size: "large",
      region: "southeast_asia",
      take: "Solid on this lane",
    });
  });

  test("Not taken forward: only the letter, the outcome, size and region, whatever their status or quote", () => {
    const { payload } = build();
    const out = payload.partners.filter(isNotTakenForward);
    // Unfit (the cheapest quote), Do Not Contact, and two Withdrawn / No Response.
    expect(out).toHaveLength(4);
    for (const p of out) expect(Object.keys(p).sort()).toEqual(["label", "outcome", "region", "size"]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/8300|9100|9950|21500|Solid on this lane|Unfit|Contact|Withdrawn|Response/);
  });

  test("never contacted, or Do Not Contact without a price: not in the report at all", () => {
    const list = [
      ...FORWARDERS.slice(0, 12),
      { name: "Never Priced DNC", status: "Do Not Contact", assessment: "Unfit", quotes: [] },
    ];
    const { payload } = build(everyPartner(), NO_LABELS, list);
    expect(payload.partners).toHaveLength(12);
  });

  test("only a shortlisted partner can be recommended", () => {
    const inputs = { ...everyPartner(), recommendedId: forwarderId(3) };
    const s = source();
    const result = buildMarketReport(s, inputs, provisionalLabels(NO_LABELS, anonymisedOrder(planMarketReport(s, null, TODAY))), { authorFirstName: null }, TODAY);
    expect(result).toEqual({ ok: false, error: REPORT_NOT_SHORTLISTED });
  });

  test("with no recommendation, the shortlist is named as shortlisted", () => {
    const { payload } = build({ ...everyPartner(), recommendedId: null });
    expect(rowsOf(payload).slice(0, 3).map((r) => r[1])).toEqual(["shortlisted", "shortlisted", "shortlisted"]);
  });

  test("letters are given in the report's order, D first", () => {
    const { order, labels } = build();
    expect(order.map((id) => labels.get(id))).toEqual(["D", "E", "F", "G", "H", "I", "J", "K", "L"]);
  });

  test("two reports for the same project: the same forwarder keeps its letter, new ones get the next, none reused", () => {
    const first = build();
    const stored: StoredLabels = { byForwarder: first.labels, used: first.labels.size };
    // Between the two reports: Redwood's price drops below Meridian's, a new
    // forwarder quotes, and Mekong (Partner F) is deleted.
    const newcomer = { name: "Newcomer Freight", status: "Reviewing Quotation", assessment: null, quotes: [{ shipment_mode: "Sea", shipment_type: "FCL", incoterm: "DDP", original_amount: 9500 }] };
    const list = [...FORWARDERS.map((f, i) => (i === 4 ? { ...f, quotes: [{ ...f.quotes[0], original_amount: 9100 }] } : f)), newcomer];
    const mekong = forwarderId(5);
    const s = toForwarderSource(
      forwarderProjectRow(),
      forwarderRows(list).filter((r) => r.id !== mekong),
      quoteRows(list).filter((q) => q.forwarder_id !== mekong),
    );
    // The deleted forwarder's letter stays used (the database keeps its row).
    const afterDelete: StoredLabels = { byForwarder: new Map([...stored.byForwarder].filter(([id]) => id !== mekong)), used: stored.used };
    const second = provisionalLabels(afterDelete, anonymisedOrder(planMarketReport(s, forwarderId(0), TODAY, afterDelete.byForwarder)));
    for (const i of [3, 4, 6, 7, 8, 9, 10, 11]) expect(second.get(forwarderId(i)), `forwarder ${i}`).toBe(first.labels.get(forwarderId(i)));
    expect(second.get(forwarderId(13))).toBe("M");
    expect([...second.values()]).not.toContain("F");
    const result = buildMarketReport(s, everyPartner(), second, { authorFirstName: null }, TODAY);
    if (!result.ok) throw new Error(result.error);
    // Redwood (E) is now cheaper than Meridian (D) and listed first; letters don't move.
    expect(rowsOf(result.payload).slice(3, 6)).toEqual([
      ["Partner E", "quoted_not_selected"],
      ["Partner M", "quoted_not_selected"],
      ["Partner D", "quoted_not_selected"],
    ]);
  });

  test("a partner that joins the shortlist is named from then on, and its letter is retired", () => {
    const first = build();
    const stored: StoredLabels = { byForwarder: first.labels, used: first.labels.size };
    const list = FORWARDERS.map((f, i) => (i === 3 ? { ...f, status: "Shortlisted" } : f));
    const { payload, labels } = build(everyPartner(), stored, list);
    expect(rowsOf(payload).map((r) => r[0])).toContain("Meridian Ocean Logistics");
    expect(rowsOf(payload).map((r) => r[0])).not.toContain("Partner D");
    expect(labels.get(forwarderId(3))).toBe("D");
  });

  test("lead time and price come from the representative quote; validity dates and terms never appear", () => {
    const { payload } = build();
    const json = JSON.stringify(payload.partners);
    expect(payload.partners[0]).toMatchObject({ priceUsd: 9000, leadMinDays: 24, leadMaxDays: 28, likeForLike: true });
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).not.toMatch(/DDU|DDP|incoterm|valid/i);
  });
});

describe("report figures", () => {
  test("the Brightline numbers: 12 contacted, 8 priced, 6 like-for-like, median $9,610, today above it", () => {
    const f = reportFigures(build().payload);
    expect(f.contacted).toBe(12);
    expect(f.priced).toBe(8);
    expect(f.likeForLike).toEqual([9000, 9420, 9420, 9800, 10150, 10600]);
    expect(f.median).toBe(9610);
    expect(f.range).toEqual({ min: 9000, max: 10600 });
    expect(f.cheaperThanToday).toBe(4);
    expect(positionTitle(f)).toBe("You're paying above the middle of the market");
    expect(f.counts).toEqual([
      { outcome: "recommended", count: 1 },
      { outcome: "shortlisted", count: 2 },
      { outcome: "quoted_not_selected", count: 3 },
      { outcome: "different_terms", count: 2 },
      { outcome: "not_taken_forward", count: 4 },
    ]);
    expect(offScaleText(f)).toBe(
      "Not on this scale: Partner G ($8,700) and Partner H ($8,950). Their quotes are on different terms or have expired, so they aren't comparable with yours.",
    );
  });

  test("fewer than two like-for-like quotes: no range or median", () => {
    const list = FORWARDERS.map((f, i) => (i >= 1 && i <= 5 ? { ...f, quotes: [] } : f));
    const f = reportFigures(build(everyPartner(), NO_LABELS, list).payload);
    expect(f.range).toBeNull();
    expect(f.median).toBeNull();
    expect(positionTitle(f)).toBe("Where the comparable quotes sit");
  });

  test("vs today: like-for-like only", () => {
    const { payload } = build();
    expect(vsTodayText(payload.partners[0], 10000)).toBe("−$1,000 (−10%)");
    expect(vsTodayText(payload.partners.find((p) => partnerName(p) === "Partner F")!, 10000)).toBe("+$600 (+6%)");
    expect(vsTodayText(payload.partners.find((p) => partnerName(p) === "Partner G")!, 10000)).toBe("Not comparable");
    expect(vsTodayText(payload.partners.find((p) => partnerName(p) === "Partner L")!, 10000)).toBe("—");
  });
});

describe("labelAt", () => {
  test("matches market_report_label_at() in the migration", () => {
    expect([0, 1, 22, 23, 48, 49].map(labelAt)).toEqual(["D", "E", "Z", "AA", "AZ", "BA"]);
  });
});
