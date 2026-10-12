import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// create-client-user.ts is the third service-role exception (docs/SECURITY.md).
// Logistics experts can call it, so it must never be usable to create or
// change anything but a client user for a client they're allowed to serve.
// The source checks pin exactly which service-role calls it makes and what
// metadata they write; the behaviour checks cover each caller and input.

const SOURCE = readFileSync(path.join(process.cwd(), "src/lib/client-users/create-client-user.ts"), "utf8");
const CODE = SOURCE.replace(/^\s*\/\/.*$/gm, "");

describe("the source", () => {
  test("its only service-role calls are createUser, getUserById and updateUserById", () => {
    expect([...CODE.matchAll(/serviceRole\.([\w.]+)\(/g)].map((m) => m[1]).sort()).toEqual([
      "auth.admin.createUser",
      "auth.admin.getUserById",
      "auth.admin.updateUserById",
    ]);
  });

  test("the service-role client is never used for data", () => {
    expect(CODE).not.toMatch(/serviceRole\.(from|rpc|storage|schema)\b/);
    expect(CODE).not.toMatch(/createAdminClient\(\)\.(?!\s*$)/);
    expect([...CODE.matchAll(/createAdminClient\(\)/g)]).toHaveLength(2);
  });

  test("no other auth admin calls (delete, invite, links, user lists)", () => {
    expect(CODE).not.toMatch(/deleteUser|inviteUserByEmail|generateLink|listUsers|signUp/);
  });

  test("createUser writes literal client metadata, with nothing spread in", () => {
    const blocks = [...CODE.matchAll(/app_metadata:\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
    expect(blocks).toEqual([
      'role: "client", client_id: clientId, first_name: firstName, must_change_password: true',
      "must_change_password: true",
    ]);
    expect(CODE).not.toMatch(/\.\.\./);
    expect(CODE).not.toMatch(/user_metadata/);
  });

  test("the reset checks the stored role is client before changing anything", () => {
    const lookup = CODE.indexOf("auth.admin.getUserById");
    const check = CODE.indexOf('app_metadata?.role !== "client"');
    const update = CODE.indexOf("auth.admin.updateUserById");
    expect(lookup).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(lookup);
    expect(update).toBeGreaterThan(check);
  });

  test("nothing logs a password", () => {
    for (const line of CODE.split("\n").filter((l) => l.includes("console."))) {
      // Neither the generated password nor any password field reaches a log.
      expect(line).not.toMatch(/oneTimePassword|\bpassword\b|attrs|target\.user\b(?!\.)/);
    }
  });
});

// ---- Behaviour --------------------------------------------------------------------

const CLIENT_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_CLIENT_ID = "00000000-0000-4000-8000-00000000c002";
const TARGET_ID = "00000000-0000-4000-8000-0000000000c1";

let caller: { id: string; app_metadata: Record<string, unknown> } | null;
let visibleClients: string[];
let ownedClientIds: string[];

// The caller's own client (RLS applies in the real one).
function userClient() {
  return {
    auth: { getUser: async () => ({ data: { user: caller } }) },
    from(table: string) {
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq(column: string, value: string) {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => ({
          data: visibleClients.includes(filters.id) ? { id: filters.id } : null,
          error: null,
        }),
        then(resolve: (r: { count: number; error: null }) => void) {
          const owned = table !== "clients" && filters.owner_id === caller?.id && ownedClientIds.includes(filters.client_id);
          resolve({ count: owned ? 1 : 0, error: null });
        },
      };
      return chain;
    },
  };
}

type AuthError = null | { code: string };
type TargetUser = { id: string; email: string; app_metadata: Record<string, unknown> };
const createUser = vi.fn<(attrs: Record<string, unknown>) => Promise<{ data: { user: { id: string } }; error: AuthError }>>(
  async () => ({ data: { user: { id: "new" } }, error: null }),
);
const getUserById = vi.fn<(id: string) => Promise<{ data: { user: TargetUser }; error: AuthError }>>(async () => ({
  data: { user: { id: TARGET_ID, email: "pat@client.test", app_metadata: { role: "client", client_id: CLIENT_ID } } },
  error: null,
}));
const updateUserById = vi.fn<(id: string, attrs: Record<string, unknown>) => Promise<{ data: object; error: AuthError }>>(
  async () => ({ data: {}, error: null }),
);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient() }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, getUserById, updateUserById } } }),
}));

const { createClientUserAccount, resetClientUserPassword, NO_PERMISSION, NOT_YOUR_CLIENT } = await import(
  "./create-client-user"
);

const INPUT = { clientId: CLIENT_ID, email: "  pat@client.test ", firstName: " Pat " };
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  caller = { id: "expert-1", app_metadata: { role: "logistics_expert" } };
  visibleClients = [CLIENT_ID, OTHER_CLIENT_ID];
  ownedClientIds = [CLIENT_ID];
});
afterEach(() => vi.clearAllMocks());

describe("createClientUserAccount", () => {
  test("an expert creates a client user for a client of a project they own", async () => {
    const result = await createClientUserAccount(INPUT);
    expect(result).toMatchObject({ ok: true, email: "pat@client.test" });
    expect(createUser).toHaveBeenCalledTimes(1);
    const attrs = createUser.mock.calls[0][0];
    expect(attrs).toEqual({
      email: "pat@client.test",
      password: result.ok ? result.oneTimePassword : "",
      email_confirm: true,
      app_metadata: { role: "client", client_id: CLIENT_ID, first_name: "Pat", must_change_password: true },
    });
  });

  test("an expert can't for a client they own no project for", async () => {
    expect(await createClientUserAccount({ ...INPUT, clientId: OTHER_CLIENT_ID })).toEqual({ ok: false, error: NOT_YOUR_CLIENT });
    expect(createUser).not.toHaveBeenCalled();
  });

  test("an admin can for any client", async () => {
    caller = { id: "admin-1", app_metadata: { role: "admin" } };
    expect(await createClientUserAccount({ ...INPUT, clientId: OTHER_CLIENT_ID })).toMatchObject({ ok: true });
    expect(createUser.mock.calls[0][0].app_metadata).toMatchObject({ role: "client", client_id: OTHER_CLIENT_ID });
  });

  test.each([
    ["a client user", { role: "client", client_id: CLIENT_ID }],
    ["an account without a role", {}],
    ["a role only in user_metadata's place", { role: "superuser" }],
  ])("%s can't", async (_label, appMetadata) => {
    caller = { id: "x", app_metadata: appMetadata };
    expect(await createClientUserAccount(INPUT)).toEqual({ ok: false, error: NO_PERMISSION });
    expect(createUser).not.toHaveBeenCalled();
  });

  test("nobody signed in can't", async () => {
    caller = null;
    expect(await createClientUserAccount(INPUT)).toEqual({ ok: false, error: NO_PERMISSION });
  });

  test("extra fields in a tampered request change nothing: the role is always client", async () => {
    const tampered = { ...INPUT, role: "admin", app_metadata: { role: "admin" }, tariff_editor: true } as unknown as typeof INPUT;
    await createClientUserAccount(tampered);
    expect(createUser.mock.calls[0][0].app_metadata).toEqual({
      role: "client",
      client_id: CLIENT_ID,
      first_name: "Pat",
      must_change_password: true,
    });
  });

  test("a client that doesn't exist (or isn't visible) is refused", async () => {
    visibleClients = [];
    expect(await createClientUserAccount(INPUT)).toEqual({ ok: false, error: "Choose a client from the list." });
    expect(createUser).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...INPUT, clientId: "not-a-uuid" }, "Choose a client from the list."],
    [{ ...INPUT, email: "nope" }, "Enter a valid email address."],
    [{ ...INPUT, firstName: "  " }, "First name is required."],
  ])("invalid input is refused before anything else: %o", async (input, message) => {
    expect(await createClientUserAccount(input)).toEqual({ ok: false, error: message });
    expect(createUser).not.toHaveBeenCalled();
  });

  test("an existing email is refused, never updated", async () => {
    createUser.mockResolvedValueOnce({ data: { user: { id: "" } }, error: { code: "email_exists" } });
    expect(await createClientUserAccount(INPUT)).toEqual({ ok: false, error: "A user with that email already exists." });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test("each one-time password is new, long, and never logged", async () => {
    const a = await createClientUserAccount(INPUT);
    createUser.mockResolvedValueOnce({ data: { user: { id: "" } }, error: { code: "unexpected_failure" } });
    await createClientUserAccount(INPUT);
    const b = await createClientUserAccount(INPUT);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.oneTimePassword).not.toBe(b.oneTimePassword);
    expect(a.oneTimePassword.length).toBeGreaterThanOrEqual(24);
    const logged = JSON.stringify(consoleError.mock.calls);
    for (const call of createUser.mock.calls) expect(logged).not.toContain(String(call[0].password));
  });
});

describe("resetClientUserPassword", () => {
  test("an admin gives a client user a new one-time password", async () => {
    caller = { id: "admin-1", app_metadata: { role: "admin" } };
    const result = await resetClientUserPassword({ userId: TARGET_ID });
    expect(result).toMatchObject({ ok: true, email: "pat@client.test" });
    expect(updateUserById).toHaveBeenCalledWith(TARGET_ID, {
      password: result.ok ? result.oneTimePassword : "",
      app_metadata: { must_change_password: true },
    });
  });

  test("an expert can't", async () => {
    expect(await resetClientUserPassword({ userId: TARGET_ID })).toEqual({ ok: false, error: NO_PERMISSION });
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test.each([
    ["an admin", { role: "admin" }],
    ["an expert", { role: "logistics_expert" }],
    ["an account without a role", {}],
    ["a client role without a client", { role: "client" }],
  ])("refuses to reset %s's password", async (_label, appMetadata) => {
    caller = { id: "admin-1", app_metadata: { role: "admin" } };
    getUserById.mockResolvedValueOnce({ data: { user: { id: TARGET_ID, email: "x@test", app_metadata: appMetadata } }, error: null });
    expect(await resetClientUserPassword({ userId: TARGET_ID })).toEqual({
      ok: false,
      error: "Only client users' passwords can be reset here.",
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test("a bad id is refused before any lookup", async () => {
    caller = { id: "admin-1", app_metadata: { role: "admin" } };
    expect((await resetClientUserPassword({ userId: "x" })).ok).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });
});
