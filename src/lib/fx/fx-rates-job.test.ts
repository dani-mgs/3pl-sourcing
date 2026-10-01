import { afterEach, describe, expect, test, vi } from "vitest";
import type { FetchedRate, FxCurrency, PreviousRate } from "./frankfurter";
import { runFxRatesJob, type FxJobDeps } from "./fx-rates-job";

const feed = [
  { date: "2026-10-01", base: "USD", quote: "EUR", rate: 0.8 },
  { date: "2026-10-01", base: "USD", quote: "VND", rate: 25000 },
];

function deps(overrides: Partial<FxJobDeps> = {}, previous: Partial<Record<FxCurrency, PreviousRate>> = {}) {
  const upserted: FetchedRate[][] = [];
  const d: FxJobDeps = {
    fetchJson: async () => feed,
    loadLatest: async (currency) => previous[currency] ?? null,
    upsert: async (rates) => {
      upserted.push(rates);
    },
    ...overrides,
  };
  return { d, upserted };
}

afterEach(() => vi.restoreAllMocks());

describe("runFxRatesJob", () => {
  test("stores validated, inverted rates and reports the missing ones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { d, upserted } = deps();
    const result = await runFxRatesJob(d);
    expect(result.ok).toBe(true);
    expect(upserted[0]).toEqual([
      { currency: "EUR", rateDate: "2026-10-01", rateToUsd: 1.25 },
      { currency: "VND", rateDate: "2026-10-01", rateToUsd: 0.00004 },
    ]);
    expect(result.ok && result.missing).toHaveLength(12);
  });

  test("skips and logs a >20% move with old and new values, keeping the old rate", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { d, upserted } = deps({}, { EUR: { rateDate: "2026-09-30", rateToUsd: 1.0 } });
    const result = await runFxRatesJob(d);
    expect(result.ok && result.skipped).toEqual(["EUR"]);
    expect(upserted[0].map((r) => r.currency)).toEqual(["VND"]);
    const log = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes("skipped EUR"));
    expect(log).toContain("old 1 on 2026-09-30");
    expect(log).toContain("new 1.25 on 2026-10-01");
  });

  test("writes nothing when the feed request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upsert = vi.fn();
    const result = await runFxRatesJob(deps({ fetchJson: async () => { throw new Error("timeout"); }, upsert }).d);
    expect(result).toEqual({ ok: false, error: "FX feed request failed." });
    expect(upsert).not.toHaveBeenCalled();
  });

  test("writes nothing when the response is malformed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upsert = vi.fn();
    const result = await runFxRatesJob(deps({ fetchJson: async () => ({ error: "oops" }), upsert }).d);
    expect(result.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  test("reports a failed write as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runFxRatesJob(deps({ upsert: async () => { throw new Error("db down"); } }).d);
    expect(result).toEqual({ ok: false, error: "Couldn't store rates." });
  });
});

describe("PGRST303 retry around each Supabase call", () => {
  const pgrst303 = () =>
    Object.assign(new Error("JWT issued at future: token-detail-do-not-log"), { code: "PGRST303" });

  test("retries a read that hits PGRST303, then stores normally", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    let eurCalls = 0;
    const { d, upserted } = deps({
      sleep,
      loadLatest: async (currency) => {
        if (currency === "EUR" && ++eurCalls <= 2) throw pgrst303();
        return null;
      },
    });
    const result = await runFxRatesJob(d);
    expect(result.ok).toBe(true);
    expect(eurCalls).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
    expect(upserted).toHaveLength(1);
    const retryLogs = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("PGRST303"));
    expect(retryLogs).toEqual([
      "FX job: loading the previous EUR rate: Supabase returned PGRST303 (attempt 1 of 6); retrying in 500 ms.",
      "FX job: loading the previous EUR rate: Supabase returned PGRST303 (attempt 2 of 6); retrying in 1000 ms.",
    ]);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("token-detail-do-not-log");
  });

  test("gives up after 6 attempts with backoff 0.5/1/2/4/8 s; a failed write is reported", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const upsert = vi.fn(async () => {
      throw pgrst303();
    });
    const result = await runFxRatesJob(deps({ sleep, upsert }).d);
    expect(result).toEqual({ ok: false, error: "Couldn't store rates." });
    expect(upsert).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000, 2000, 4000, 8000]);
  });

  test("writes nothing when a read keeps failing with PGRST303", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upsert = vi.fn();
    const result = await runFxRatesJob(
      deps({
        sleep: async () => {},
        loadLatest: async () => {
          throw pgrst303();
        },
        upsert,
      }).d,
    );
    expect(result).toEqual({ ok: false, error: "Couldn't load previous rates." });
    expect(upsert).not.toHaveBeenCalled();
  });

  test("any other error code is not retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const upsert = vi.fn(async () => {
      throw Object.assign(new Error("JWT expired"), { code: "PGRST301" });
    });
    const result = await runFxRatesJob(deps({ sleep, upsert }).d);
    expect(result.ok).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
