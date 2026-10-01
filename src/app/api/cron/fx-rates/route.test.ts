import { afterEach, describe, expect, test, vi } from "vitest";

// The route must refuse before touching the database or the network.
const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient }));

const { GET, maxDuration } = await import("./route");

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/fx-rates", {
    headers: authorization ? { authorization } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  createAdminClient.mockReset();
});

describe("GET /api/cron/fx-rates", () => {
  test("401 without the secret header, before any database access", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret-0123456789abcdef");
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("401 with a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret-0123456789abcdef");
    expect((await GET(request("Bearer nope"))).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("401 for everyone when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/fx-rates, authorized", () => {
  test("fetches the feed and upserts every rate it validated (no network, stubbed client)", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret-0123456789abcdef");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { date: "2026-10-01", base: "USD", quote: "EUR", rate: 0.8 },
          { date: "2026-10-01", base: "USD", quote: "VND", rate: 25000 },
        ]),
      ),
    );
    const upserts: { rows: unknown; options: unknown }[] = [];
    const read = {
      select: () => read,
      eq: () => read,
      order: () => read,
      limit: () => read,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    createAdminClient.mockReturnValue({
      from: (table: string) => {
        expect(table).toBe("fx_rates");
        return {
          ...read,
          upsert: async (rows: unknown, options: unknown) => {
            upserts.push({ rows, options });
            return { error: null };
          },
        };
      },
    });

    const response = await GET(request("Bearer test-secret-0123456789abcdef"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.stored.map((r: { currency: string }) => r.currency)).toEqual(["EUR", "VND"]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].options).toEqual({ onConflict: "rate_date,currency" });
    expect(upserts[0].rows).toEqual([
      expect.objectContaining({ rate_date: "2026-10-01", currency: "EUR", rate_to_usd: 1.25, source: "frankfurter" }),
      expect.objectContaining({ rate_date: "2026-10-01", currency: "VND", rate_to_usd: 0.00004, source: "frankfurter" }),
    ]);
  });

  test("maxDuration fits the worst-case retry budget and the Hobby limit", () => {
    expect(maxDuration).toBe(60);
  });
});
