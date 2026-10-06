import { afterEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ESTIMATE_RETRY_DELAYS_MS, SAVE_FAILED, saveDutyEstimate } from "./estimate-store";

// The estimate save's only database call: save_duty_estimate through the
// service role, retried on PGRST303 (the key's clock-skew error) for a few
// seconds at most, and nothing else retried.

const USER = "00000000-0000-4000-8000-0000000000a1";
const ROW = { hts_code: "6402993160", total_usd: 647.14 };
const ID = "00000000-0000-4000-8000-0000000d0001";

function clientReturning(...results: { data?: unknown; error?: { code: string; message: string } | null }[]) {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce({ data: r.data ?? null, error: r.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}
const skew = { error: { code: "PGRST303", message: "JWT issued at future" } };

afterEach(() => vi.restoreAllMocks());

describe("saveDutyEstimate", () => {
  test("succeeds on the first try, calling only save_duty_estimate with the user and the row", async () => {
    const { client, rpc } = clientReturning({ data: ID });
    const sleep = vi.fn(async () => {});
    expect(await saveDutyEstimate(USER, ROW, { client, sleep })).toEqual({ ok: true, id: ID });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_duty_estimate", { p_user_id: USER, p_row: ROW });
    expect(sleep).not.toHaveBeenCalled();
  });

  test("succeeds after a PGRST303, waiting briefly", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, rpc } = clientReturning(skew, { data: ID });
    const sleep = vi.fn(async () => {});
    expect(await saveDutyEstimate(USER, ROW, { client, sleep })).toEqual({ ok: true, id: ID });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[ESTIMATE_RETRY_DELAYS_MS[0]]]);
  });

  test("gives up after the limit with the generic message, in about 3 seconds of waiting", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, rpc } = clientReturning(skew, skew, skew, skew);
    const sleep = vi.fn(async () => {});
    expect(await saveDutyEstimate(USER, ROW, { client, sleep })).toEqual({ ok: false, error: SAVE_FAILED });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(ESTIMATE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3000);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("saveDutyEstimate error:", expect.objectContaining({ code: "PGRST303" }));
  });

  test.each([
    ["a permission error", { code: "42501", message: "Only the project's owner or an admin can link" }],
    ["a validation error", { code: "23514", message: "The lines don't add up to the totals." }],
    ["a server error", { code: "XX000", message: "boom" }],
  ])("never retries %s, and the user gets only the generic message", async (_name, error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, rpc } = clientReturning({ error });
    const sleep = vi.fn(async () => {});
    const result = await saveDutyEstimate(USER, ROW, { client, sleep });
    expect(result).toEqual({ ok: false, error: SAVE_FAILED });
    expect(JSON.stringify(result)).not.toContain(error.message);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("saveDutyEstimate error:", expect.objectContaining({ code: error.code }));
  });

  test("a reply without an id is a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientReturning({ data: null });
    expect(await saveDutyEstimate(USER, ROW, { client })).toEqual({ ok: false, error: SAVE_FAILED });
  });
});
