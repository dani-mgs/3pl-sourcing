import { beforeEach, describe, expect, test, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { requireClient } = await import("./require-client");

const CLIENT_ID = "00000000-0000-4000-8000-00000000c001";

function signedInAs(appMetadata: Record<string, unknown> | undefined) {
  getUser.mockResolvedValue({ data: { user: appMetadata ? { id: "u1", app_metadata: appMetadata } : null } });
}

describe("requireClient", () => {
  beforeEach(() => getUser.mockReset());

  test("lets a client user with a client through", async () => {
    signedInAs({ role: "client", client_id: CLIENT_ID, first_name: " Pat ", must_change_password: true });
    await expect(requireClient()).resolves.toEqual({
      userId: "u1",
      clientId: CLIENT_ID,
      firstName: "Pat",
      mustChangePassword: true,
    });
  });

  test.each([
    ["an admin", { role: "admin" }],
    ["an expert", { role: "logistics_expert" }],
    ["an account without a role", {}],
    ["a client role without a client", { role: "client" }],
    ["a staff role with a client_id", { role: "logistics_expert", client_id: CLIENT_ID }],
    ["nobody signed in", undefined],
  ])("404s %s", async (_label, meta) => {
    signedInAs(meta);
    await expect(requireClient()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
