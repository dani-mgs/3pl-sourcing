import { afterEach, describe, expect, test, vi } from "vitest";

// Where sign-in lands: client users go straight to the portal (or to choose
// their password), everyone else to the hub, as before.

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword } }) }));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));
vi.spyOn(console, "error").mockImplementation(() => {});

const { login } = await import("./actions");

function form() {
  const data = new FormData();
  data.set("email", "someone@test.local");
  data.set("password", "a password");
  return data;
}

function signedInAs(appMetadata: Record<string, unknown>) {
  signInWithPassword.mockResolvedValueOnce({ data: { user: { id: "u1", app_metadata: appMetadata } }, error: null });
}

afterEach(() => vi.clearAllMocks());

describe("login", () => {
  test.each([
    [{ role: "client", client_id: "c1" }, "/portal"],
    [{ role: "client", client_id: "c1", must_change_password: true }, "/portal/change-password"],
    [{ role: "logistics_expert" }, "/"],
    [{ role: "admin" }, "/"],
    [{}, "/"],
  ])("%o lands on %s", async (meta, path) => {
    signedInAs(meta);
    await expect(login(form())).rejects.toThrow(`REDIRECT ${path}`);
  });

  test("a wrong password gets the generic message", async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { user: null }, error: { code: "invalid_credentials" } });
    expect(await login(form())).toEqual({ error: "Invalid email or password." });
    expect(redirect).not.toHaveBeenCalled();
  });
});
