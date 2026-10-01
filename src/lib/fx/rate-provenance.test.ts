import { describe, expect, test, vi } from "vitest";
import {
  RATE_SOURCE_LABELS,
  businessDaysBetween,
  isRateStale,
  rateCaption,
  rateLockedNote,
  resolveInitialRate,
  verifyRateProvenance,
  type SavedRate,
} from "./rate-provenance";

const TODAY = "2026-10-01"; // a Thursday
const latest = { KRW: { rateToUsd: 0.000738, rateDate: "2026-09-30" } };

describe("resolveInitialRate (precedence)", () => {
  test("USD (or no currency) is always 1 with no source", () => {
    expect(resolveInitialRate({ currency: "USD", latest, today: TODAY })).toEqual({ rate: "1", source: null, date: null });
    expect(resolveInitialRate({ currency: "", latest, today: TODAY }).source).toBeNull();
  });

  test("a rate stated in the document wins, dated by the document's quote date", () => {
    expect(
      resolveInitialRate({ currency: "KRW", documentRate: 0.0007, documentDate: "2026-09-25", latest, today: TODAY }),
    ).toEqual({ rate: "0.0007", source: "forwarder_document", date: "2026-09-25" });
  });

  test("a document rate without a stated date is dated today", () => {
    expect(resolveInitialRate({ currency: "KRW", documentRate: 0.0007, latest, today: TODAY }).date).toBe(TODAY);
  });

  test("no document rate: the latest daily rate, with its own date", () => {
    expect(resolveInitialRate({ currency: "KRW", documentRate: null, latest, today: TODAY })).toEqual({
      rate: "0.000738",
      source: "daily_feed",
      date: "2026-09-30",
    });
  });

  test("no daily rate either: blank for manual entry — never 1", () => {
    expect(resolveInitialRate({ currency: "VND", latest, today: TODAY })).toEqual({ rate: "", source: "manual", date: TODAY });
  });
});

describe("staleness (business days)", () => {
  test("weekends don't count", () => {
    expect(businessDaysBetween("2026-09-25", "2026-09-28")).toBe(1); // Fri → Mon
    expect(businessDaysBetween("2026-09-30", "2026-10-01")).toBe(1);
    expect(businessDaysBetween("2026-10-01", "2026-10-01")).toBe(0);
  });

  test("stale only past 3 business days", () => {
    expect(isRateStale("2026-09-28", TODAY)).toBe(false); // Mon → Thu: 3
    expect(isRateStale("2026-09-25", TODAY)).toBe(true); // Fri → Thu: 4
    expect(isRateStale("2026-09-25", "2026-09-30")).toBe(false); // Fri → Wed: 3
  });
});

describe("labels and captions", () => {
  test("human-readable labels for every source", () => {
    expect(RATE_SOURCE_LABELS).toEqual({
      daily_feed: "Daily reference rate",
      forwarder_document: "Forwarder's quoted rate",
      manual: "Entered manually",
      manual_legacy: "Entered manually (date not recorded)",
    });
  });

  test("form caption", () => {
    expect(rateCaption("KRW", 0.000738105, "daily_feed", "2026-10-01")).toBe(
      "1 KRW = 0.00073811 USD · as of Oct 1, 2026 · Daily reference rate",
    );
    expect(rateCaption("EUR", 1.1, "manual_legacy", null)).toBe("1 EUR = 1.1 USD · Entered manually (date not recorded)");
  });

  test("rate-locked note: none for USD, dated otherwise, legacy wording without a date", () => {
    expect(rateLockedNote("USD", null, null)).toBeNull();
    expect(rateLockedNote("KRW", "daily_feed", "2026-10-01")).toEqual({
      text: "rate locked Oct 1, 2026",
      title: "Daily reference rate",
    });
    expect(rateLockedNote("EUR", "manual_legacy", null)?.text).toBe("Entered manually (date not recorded)");
  });
});

describe("verifyRateProvenance (server)", () => {
  const posted = (over: Partial<SavedRate>): SavedRate => ({
    original_currency: "KRW",
    exchange_rate_to_usd: 0.000738,
    exchange_rate_source: "daily_feed",
    exchange_rate_date: "2026-09-30",
    ...over,
  });
  const feed = (rate: number | null) => vi.fn(async () => rate);

  test("a daily_feed claim matching fx_rates for that date is kept", async () => {
    const lookup = feed(0.000738);
    expect(await verifyRateProvenance(posted({}), null, TODAY, lookup)).toEqual({ source: "daily_feed", date: "2026-09-30" });
    expect(lookup).toHaveBeenCalledWith("KRW", "2026-09-30");
  });

  test("a daily_feed claim that doesn't match (or has no feed row) becomes manual today", async () => {
    expect(await verifyRateProvenance(posted({ exchange_rate_to_usd: 0.0009 }), null, TODAY, feed(0.000738))).toEqual({
      source: "manual",
      date: TODAY,
    });
    expect(await verifyRateProvenance(posted({}), null, TODAY, feed(null))).toEqual({ source: "manual", date: TODAY });
    expect(await verifyRateProvenance(posted({ exchange_rate_date: null }), null, TODAY, feed(0.000738))).toEqual({
      source: "manual",
      date: TODAY,
    });
  });

  test("manual is dated today; a new legacy claim is refused", async () => {
    expect(
      await verifyRateProvenance(posted({ exchange_rate_source: "manual", exchange_rate_date: "2020-01-01" }), null, TODAY, feed(null)),
    ).toEqual({ source: "manual", date: TODAY });
    expect(
      await verifyRateProvenance(posted({ exchange_rate_source: "manual_legacy", exchange_rate_date: null }), null, TODAY, feed(null)),
    ).toEqual({ source: "manual", date: TODAY });
  });

  test("forwarder_document keeps its stated date", async () => {
    expect(
      await verifyRateProvenance(
        posted({ exchange_rate_source: "forwarder_document", exchange_rate_date: "2026-09-25" }),
        null,
        TODAY,
        feed(null),
      ),
    ).toEqual({ source: "forwarder_document", date: "2026-09-25" });
  });

  test("an unchanged rate on an edited quote keeps its provenance, including legacy", async () => {
    const legacy = posted({ original_currency: "EUR", exchange_rate_to_usd: 1.1, exchange_rate_source: "manual_legacy", exchange_rate_date: null });
    const lookup = feed(null);
    expect(await verifyRateProvenance(legacy, legacy, TODAY, lookup)).toEqual({ source: "manual_legacy", date: null });
    expect(lookup).not.toHaveBeenCalled();
    const oldManual = posted({ exchange_rate_source: "manual", exchange_rate_date: "2026-09-20" });
    expect(await verifyRateProvenance(oldManual, oldManual, TODAY, lookup)).toEqual({ source: "manual", date: "2026-09-20" });
  });

  test("changing the rate or currency of a legacy quote drops the legacy label", async () => {
    const legacy = posted({ original_currency: "EUR", exchange_rate_to_usd: 1.1, exchange_rate_source: "manual_legacy", exchange_rate_date: null });
    expect(
      await verifyRateProvenance({ ...legacy, exchange_rate_to_usd: 1.12 }, legacy, TODAY, feed(null)),
    ).toEqual({ source: "manual", date: TODAY });
  });

  test("USD never has a source", async () => {
    expect(await verifyRateProvenance(posted({ original_currency: "USD" }), null, TODAY, feed(null))).toEqual({
      source: null,
      date: null,
    });
  });
});
