import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The checklist action: tariff editors and admins only, input validated before
// any database call, the signed-in user's own client (never the service role),
// and generic messages for anything unexpected.

const rpc = vi.fn();
const getTariffPermissions = vi.fn();
const createClient = vi.fn(async () => ({ rpc }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/get-tariff-permissions", () => ({ getTariffPermissions }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin-client", () => {
  throw new Error("the checklist must never use the service role");
});

const { setChecklistItem } = await import("./actions");

const ID = "6f1d5b7e-3c0a-4f64-9a66-0d0c3a1b2c3d";
const request = { itemId: ID, done: true, note: " ok ", version: 2 };

beforeEach(() => {
  rpc.mockClear();
  getTariffPermissions.mockResolvedValue({ isAdmin: false, canEditTariffData: true });
  rpc.mockResolvedValue({ data: 3, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("setChecklistItem", () => {
  test("calls set_checklist_item as the user with the cleaned arguments", async () => {
    expect(await setChecklistItem(request)).toEqual({ version: 3 });
    expect(rpc).toHaveBeenCalledWith("set_checklist_item", { p_item: ID, p_done: true, p_note: "ok", p_expected_version: 2 });
  });

  test("a user who is not an editor is refused before any call", async () => {
    getTariffPermissions.mockResolvedValue({ isAdmin: false, canEditTariffData: false });
    expect(await setChecklistItem(request)).toEqual({ error: "You don't have permission to change this item." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["a bad id", { ...request, itemId: "x" }],
    ["a null tick state", { ...request, done: null }],
    ["a long note", { ...request, note: "x".repeat(501) }],
  ])("%s is refused before any call", async (_n, raw) => {
    const result = await setChecklistItem(raw);
    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("database refusals get plain messages; anything else is generic and logged", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Not allowed." } });
    expect(await setChecklistItem(request)).toEqual({ error: "You don't have permission to change this item." });
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "This item was changed by someone else." } });
    expect((await setChecklistItem(request)).error).toMatch(/Someone else changed this item/);
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret detail" } });
    expect(await setChecklistItem(request)).toEqual({ error: "An unexpected error occurred." });
    expect(console.error).toHaveBeenCalled();
  });
});
