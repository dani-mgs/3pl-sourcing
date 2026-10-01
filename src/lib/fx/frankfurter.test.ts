import { describe, expect, test } from "vitest";
import {
  FX_CURRENCIES,
  FRANKFURTER_URL,
  parseFrankfurterResponse,
  planFxUpsert,
  type FetchedRate,
  type FxCurrency,
  type PreviousRate,
} from "./frankfurter";

const record = (quote: string, rate: number, date = "2026-10-01") => ({ date, base: "USD", quote, rate });

describe("FX_CURRENCIES / FRANKFURTER_URL", () => {
  test("covers the 14 non-USD quote currencies and asks for all of them", () => {
    expect(FX_CURRENCIES).toHaveLength(14);
    expect(FX_CURRENCIES).not.toContain("USD");
    expect(FRANKFURTER_URL).toContain("base=USD");
    for (const c of FX_CURRENCIES) expect(FRANKFURTER_URL).toContain(c);
  });
});

describe("parseFrankfurterResponse", () => {
  test("inverts units-per-USD into USD per unit, rounded to 10 decimals", () => {
    const result = parseFrankfurterResponse([record("EUR", 0.88087), record("VND", 25923), record("KRW", 1354.82)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byCurrency = Object.fromEntries(result.rates.map((r) => [r.currency, r.rateToUsd]));
    expect(byCurrency.EUR).toBe(1.1352412955);
    expect(byCurrency.VND).toBe(0.0000385758);
    expect(byCurrency.KRW).toBe(0.0007381054);
    expect(result.rates[0].rateDate).toBe("2026-10-01");
  });

  test("ignores the USD identity record and currencies we don't quote in", () => {
    const result = parseFrankfurterResponse([record("USD", 1), record("CHF", 0.8), record("EUR", 0.9)]);
    expect(result.ok && result.rates.map((r) => r.currency)).toEqual(["EUR"]);
  });

  test("reports wanted currencies the feed didn't return as missing", () => {
    const result = parseFrankfurterResponse([record("EUR", 0.9)]);
    expect(result.ok && result.missing).toHaveLength(13);
    expect(result.ok && result.missing).toContain("VND");
  });

  test("rejects malformed responses", () => {
    expect(parseFrankfurterResponse({ rates: {} }).ok).toBe(false);
    expect(parseFrankfurterResponse([{ ...record("EUR", 0.9), base: "EUR" }]).ok).toBe(false);
    expect(parseFrankfurterResponse([record("EUR", 0)]).ok).toBe(false);
    expect(parseFrankfurterResponse([record("EUR", -1)]).ok).toBe(false);
    expect(parseFrankfurterResponse([record("EUR", 0.9, "Oct 1")]).ok).toBe(false);
    expect(parseFrankfurterResponse([{ ...record("EUR", 0.9), rate: "0.9" }]).ok).toBe(false);
  });
});

describe("planFxUpsert", () => {
  const fetched = (currency: FxCurrency, rateToUsd: number): FetchedRate => ({ currency, rateDate: "2026-10-01", rateToUsd });
  const prev = (entries: [FxCurrency, number][]) =>
    new Map<FxCurrency, PreviousRate>(entries.map(([c, r]) => [c, { rateDate: "2026-09-30", rateToUsd: r }]));

  test("accepts a currency's first rate with nothing to compare against", () => {
    expect(planFxUpsert([fetched("EUR", 5)], prev([])).accept).toHaveLength(1);
  });

  test("accepts moves up to 20%, skips anything beyond", () => {
    const { accept, skip } = planFxUpsert(
      [fetched("EUR", 1.2), fetched("GBP", 1.21), fetched("JPY", 0.8), fetched("CAD", 0.79)],
      prev([["EUR", 1], ["GBP", 1], ["JPY", 1], ["CAD", 1]]),
    );
    expect(accept.map((r) => r.currency)).toEqual(["EUR", "JPY"]);
    expect(skip.map((s) => s.currency)).toEqual(["GBP", "CAD"]);
    expect(skip[0].previous.rateToUsd).toBe(1);
    expect(skip[0].fetched.rateToUsd).toBe(1.21);
    expect(skip[0].change).toBeCloseTo(0.21);
  });
});

describe("real Frankfurter v2 response (captured 2026-10-01)", () => {
  test("parses all 14 currencies with sane USD-per-unit values", async () => {
    const body = (await import("./__fixtures__/frankfurter-v2-usd.json")).default;
    const result = parseFrankfurterResponse(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missing).toEqual([]);
    expect(result.rates).toHaveLength(14);
    const eur = result.rates.find((r) => r.currency === "EUR")!;
    expect(eur.rateToUsd).toBeGreaterThan(1);
    expect(eur.rateToUsd).toBeLessThan(1.5);
    const vnd = result.rates.find((r) => r.currency === "VND")!;
    expect(vnd.rateToUsd).toBeGreaterThan(0.00003);
    expect(vnd.rateToUsd).toBeLessThan(0.00005);
  });
});
