import { afterEach, describe, expect, test, vi } from "vitest";

// The first-login password change: one Server Action that changes the
// password as the client user and only then clears must_change_password.

const calls: string[] = [];
const updateUser = vi.fn<(attrs: { password: string }) => Promise<{ error: null | { code: string } }>>(async () => {
  calls.push("updateUser");
  return { error: null };
});
const rpc = vi.fn(async (fn: string) => {
  calls.push(`rpc ${fn}`);
  return { error: null as null | { code: string } };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { updateUser }, rpc }) }));

const requireClient = vi.fn(async () => ({ userId: "c1", clientId: "x", firstName: null, mustChangePassword: true }));
vi.mock("@/lib/auth/require-client", () => ({ requireClient }));

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

const { changePassword } = await import("./actions");

const GOOD = "correct horse battery staple";

function form(password: string, confirm = password) {
  const data = new FormData();
  data.set("password", password);
  data.set("confirm", confirm);
  return data;
}

afterEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("changePassword", () => {
  test("changes the password, then clears the flag, then goes to the portal", async () => {
    await expect(changePassword({}, form(GOOD))).rejects.toThrow("REDIRECT /portal");
    expect(calls).toEqual(["updateUser", "rpc complete_password_change"]);
    expect(updateUser).toHaveBeenCalledWith({ password: GOOD });
  });

  test("anyone but a client user is refused before anything happens", async () => {
    requireClient.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(changePassword({}, form(GOOD))).rejects.toThrow("404");
    expect(calls).toEqual([]);
  });

  test.each([
    ["too short", form("short pass"), "Use at least 12 characters."],
    ["too long", form("x".repeat(73)), "Use 72 characters or fewer."],
    ["not matching", form(GOOD, `${GOOD}!`), "The two passwords don't match."],
  ])("a password that's %s changes nothing", async (_label, data, message) => {
    expect(await changePassword({}, data)).toEqual({ error: message });
    expect(calls).toEqual([]);
  });

  test("if the password change fails, the flag stays set", async () => {
    updateUser.mockResolvedValueOnce({ error: { code: "same_password" } });
    expect(await changePassword({}, form(GOOD))).toEqual({ error: "Choose a password different from your current one." });
    expect(rpc).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("if clearing the flag fails, they're told and stay on the page", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "PGRST000" } });
    const result = await changePassword({}, form(GOOD));
    expect(result.error).toMatch(/couldn't finish/);
    expect(redirect).not.toHaveBeenCalled();
  });

  test("passwords never reach a log", async () => {
    updateUser.mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    await changePassword({}, form(GOOD));
    await changePassword({}, form("short"));
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(GOOD);
  });
});
