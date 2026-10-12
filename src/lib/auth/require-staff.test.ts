import { beforeEach, describe, expect, test, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { requireStaff } = await import("./require-staff");

function signedInAs(appMetadata: Record<string, unknown> | undefined) {
  getUser.mockResolvedValue({ data: { user: appMetadata ? { id: "u1", app_metadata: appMetadata } : null } });
}

describe("requireStaff", () => {
  beforeEach(() => getUser.mockReset());

  test.each(["admin", "logistics_expert"])("lets %s through and returns the role", async (role) => {
    signedInAs({ role });
    await expect(requireStaff()).resolves.toBe(role);
  });

  test.each([
    ["a client user", { role: "client", client_id: "00000000-0000-4000-8000-00000000c001" }],
    ["a client user with a tariff_editor flag", { role: "client", client_id: "x", tariff_editor: true }],
    ["an account without a role", {}],
    ["an unknown role", { role: "superuser" }],
    ["a wrongly cased role", { role: "Admin" }],
    ["nobody signed in", undefined],
  ])("404s %s", async (_label, appMetadata) => {
    signedInAs(appMetadata);
    await expect(requireStaff()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  test("ignores user_metadata (which users can edit)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", app_metadata: { role: "client" }, user_metadata: { role: "admin" } } } });
    await expect(requireStaff()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
