import { afterEach, describe, expect, test, vi } from "vitest";
import { loadLatestFxRates, todayUtc, withVerifiedRateProvenance } from "./server-rates";
import type { QuoteFields } from "@/lib/forwarder/parse-quote-form";

// A stub of just the Supabase query chains these two functions use; it
// records each filter so the test can check what was asked for.
function stubSupabase(options: { feedRow?: { rate_to_usd: string } | null; latest?: unknown[]; error?: unknown }) {
  const filters: [string, unknown][] = [];
  const tables: string[] = [];
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    },
    maybeSingle: async () => ({ data: options.feedRow ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: options.latest ?? [], error: options.error ?? null }),
  };
  const supabase = {
    from: (table: string) => {
      tables.push(table);
      return chain;
    },
  };
  return { supabase: supabase as never, filters, tables };
}

const quote = (fields: Partial<QuoteFields>) => ({ scenario_group: "Lane A", ...fields }) as QuoteFields;

afterEach(() => vi.useRealTimers());

describe("withVerifiedRateProvenance", () => {
  test("a daily_feed claim matching the stored rate for that date is kept", async () => {
    const { supabase, filters, tables } = stubSupabase({ feedRow: { rate_to_usd: "0.0007381654" } });
    const result = await withVerifiedRateProvenance(
      supabase,
      quote({
        original_currency: "KRW",
        exchange_rate_to_usd: 0.0007381654,
        exchange_rate_source: "daily_feed",
        exchange_rate_date: "2026-10-01",
      }),
      null,
    );
    expect(tables).toEqual(["fx_rates"]);
    expect(filters).toEqual([
      ["currency", "KRW"],
      ["rate_date", "2026-10-01"],
    ]);
    expect(result).toMatchObject({ exchange_rate_source: "daily_feed", exchange_rate_date: "2026-10-01" });
  });

  test("a daily_feed claim with no stored row becomes manual, dated today (UTC)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T23:30:00Z") });
    const { supabase } = stubSupabase({ feedRow: null });
    const result = await withVerifiedRateProvenance(
      supabase,
      quote({
        original_currency: "KRW",
        exchange_rate_to_usd: 0.001,
        exchange_rate_source: "daily_feed",
        exchange_rate_date: "2026-10-01",
      }),
      null,
    );
    expect(result).toMatchObject({ exchange_rate_source: "manual", exchange_rate_date: "2026-10-02" });
  });

  test("the rest of the quote is passed through untouched", async () => {
    const { supabase } = stubSupabase({});
    const input = quote({ original_currency: "USD", exchange_rate_to_usd: 1, notes: "keep me" });
    const result = await withVerifiedRateProvenance(supabase, input, null);
    expect(result).toEqual({ ...input, exchange_rate_source: null, exchange_rate_date: null });
  });
});

describe("loadLatestFxRates", () => {
  test("maps the latest-rate view to numbers by currency", async () => {
    const { supabase, tables } = stubSupabase({
      latest: [{ currency: "EUR", rate_date: "2026-10-01", rate_to_usd: "1.0800000000" }],
    });
    expect(await loadLatestFxRates(supabase)).toEqual({ EUR: { rateToUsd: 1.08, rateDate: "2026-10-01" } });
    expect(tables).toEqual(["fx_rates_latest"]);
  });

  test("a read error gives no rates rather than failing the page", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { supabase } = stubSupabase({ error: { code: "42501" } });
    expect(await loadLatestFxRates(supabase)).toEqual({});
  });
});

describe("todayUtc", () => {
  test("is the UTC calendar date", () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T23:59:59Z") });
    expect(todayUtc()).toBe("2026-10-01");
  });
});
