import { afterEach, describe, expect, test, vi } from "vitest";

// The route must refuse before touching the database or the network.
const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient }));
const createHtsImportStore = vi.fn();
vi.mock("@/lib/tariff/hts-import-store", () => ({ createHtsImportStore }));

const { GET, maxDuration } = await import("./route");

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/hts-release", {
    headers: authorization ? { authorization } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  createAdminClient.mockReset();
  createHtsImportStore.mockReset();
});

describe("GET /api/cron/hts-release", () => {
  test("401 without the secret header, before any database or network access", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret-0123456789abcdef");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await GET(request())).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
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

  test("authorized: checks USITC's current release and reports up to date (stubbed)", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret-0123456789abcdef");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith("/currentRelease")) return Response.json({ name: "2026HTSRev20", title: "Revision 20 (2026)" });
        return Response.json([{ name: "2026HTSRev20", releaseStartDate: "09/28/2026" }]);
      }),
    );
    const current = { id: "r1", name: "2026HTSRev20", status: "current", next_chapter: 100, chapter_counts: {}, row_count: 0, attempts: 0 };
    createHtsImportStore.mockReturnValue({
      loadCurrent: async () => current,
      loadImporting: async () => null,
    });

    const response = await GET(request("Bearer test-secret-0123456789abcdef"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "up_to_date", release: "2026HTSRev20" });
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(urls).toEqual([
      "https://hts.usitc.gov/reststop/currentRelease",
      "https://hts.usitc.gov/reststop/releaseList",
    ]);
  });

  test("maxDuration is the Hobby maximum; the job's own budget keeps runs well inside it", () => {
    expect(maxDuration).toBe(300);
  });
});
