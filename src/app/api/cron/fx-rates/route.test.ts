import { afterEach, describe, expect, test, vi } from "vitest";

// The route must refuse before touching the database or the network.
const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient }));

const { GET } = await import("./route");

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/fx-rates", {
    headers: authorization ? { authorization } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
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
