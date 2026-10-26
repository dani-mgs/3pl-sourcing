import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The Forwarder Audit actions: inputs are checked before anything is sent,
// only the owner or an admin gets as far as the write, the stale check is
// part of the write and updated_at goes back exactly as it was read, a
// refused write (no row back) is reported, and the flag gates everything.
// The database is stubbed.

const AUDIT = "00000000-0000-4000-8000-000000000401";
const UPDATED_AT = "2026-10-26T14:06:23.123456+00:00";

let role = "logistics_expert";
let enabled = true;
let ownerId: string | null = "u1";
let updateRows: unknown[] = [{ id: AUDIT, updated_at: "2026-10-26T14:10:00.654321+00:00" }];
let deleteRows: unknown[] = [{ id: AUDIT }];
let insertResult: { data: unknown; error: unknown } = { data: { id: AUDIT }, error: null };
const calls: { op: string; payload?: unknown; filters: [string, unknown][] }[] = [];

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from() {
      let op = "select";
      let payload: unknown;
      const filters: [string, unknown][] = [];
      const chain = {
        select: () => chain,
        insert: (p: unknown) => ((op = "insert"), (payload = p), chain),
        update: (p: unknown) => ((op = "update"), (payload = p), chain),
        delete: () => ((op = "delete"), chain),
        eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
        single: async () => insertResult,
        maybeSingle: async () => ({ data: ownerId ? { owner_id: ownerId, updated_at: UPDATED_AT } : null, error: null }),
        then: (resolve: (value: unknown) => void) => {
          calls.push({ op, payload, filters });
          resolve({ data: op === "update" ? updateRows : deleteRows, error: null });
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff: vi.fn(async () => role) }));
vi.mock("@/lib/forwarder-audit/feature-flag", () => ({ isForwarderAuditEnabled: () => enabled }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createAuditAction, deleteAuditAction, saveAuditAction } = await import("./actions");
const { blankInputs } = await import("@/lib/forwarder-audit/input-schema");

const input = (over: Record<string, unknown> = {}) => ({ auditId: AUDIT, expectedUpdatedAt: UPDATED_AT, inputs: blankInputs(), ...over });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  role = "logistics_expert";
  enabled = true;
  ownerId = "u1";
  updateRows = [{ id: AUDIT, updated_at: "2026-10-26T14:10:00.654321+00:00" }];
  deleteRows = [{ id: AUDIT }];
  insertResult = { data: { id: AUDIT }, error: null };
  calls.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("flag off", () => {
  test("every action refuses before reading or writing", async () => {
    enabled = false;
    expect(await createAuditAction()).toMatchObject({ ok: false, code: "unavailable" });
    expect(await saveAuditAction(input())).toMatchObject({ ok: false, code: "unavailable" });
    expect(await deleteAuditAction({ auditId: AUDIT })).toMatchObject({ ok: false, code: "unavailable" });
    expect(calls).toEqual([]);
  });
});

describe("createAuditAction", () => {
  test("creates a blank audit and returns its id", async () => {
    expect(await createAuditAction()).toEqual({ ok: true, auditId: AUDIT });
  });
  test("reports a database error in its own words", async () => {
    insertResult = { data: null, error: { message: "boom" } };
    expect(await createAuditAction()).toMatchObject({ ok: false, code: "failed", error: "Something went wrong. Try again." });
  });
});

describe("saveAuditAction", () => {
  test("saves valid inputs with the stale check inside the write, and returns the new updated_at", async () => {
    const result = await saveAuditAction(input());
    expect(result).toEqual({ ok: true, updatedAt: "2026-10-26T14:10:00.654321+00:00" });
    const write = calls.find((c) => c.op === "update")!;
    expect(write.filters).toEqual([["id", AUDIT], ["updated_at", UPDATED_AT]]);
  });

  test("drops trailing empty charge lines", async () => {
    const inputs = blankInputs();
    inputs.lines = [{ charge: "THC", category: "", basis: "", rate: 5, currency: "", status: "Firm", quantityOverride: null, minimumCharge: null, localTaxRate: null, forwarderLineTotal: null, agreedRate: null, reviewerFlag: "", note: "" }];
    inputs.lines.push({ ...inputs.lines[0], charge: "", rate: null, status: "" });
    await saveAuditAction(input({ inputs }));
    expect((calls.find((c) => c.op === "update")!.payload as { inputs: { lines: unknown[] } }).inputs.lines).toHaveLength(1);
  });

  test.each([
    ["an unknown dropdown value", (i: ReturnType<typeof blankInputs>) => void (i.shipment.incoterm = "XYZ")],
    ["a text over its limit", (i: ReturnType<typeof blankInputs>) => void (i.shipment.client = "x".repeat(201))],
    ["a number that isn't finite", (i: ReturnType<typeof blankInputs>) => void (i.shipment.pieces = Infinity)],
    ["an impossible date", (i: ReturnType<typeof blankInputs>) => void (i.shipment.auditDate = "2026-02-31")],
    ["51 charge lines", (i: ReturnType<typeof blankInputs>) => void (i.lines = Array.from({ length: 51 }, () => ({ ...blankInputs().lines[0], charge: "x" }) as never))],
    ["six services", (i: ReturnType<typeof blankInputs>) => void i.services.pop()],
  ])("refuses %s before writing", async (_name, mutate) => {
    const inputs = blankInputs();
    mutate(inputs);
    const result = await saveAuditAction(input({ inputs }));
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(calls).toEqual([]);
  });

  test("refuses an unknown field (strict) and a malformed request", async () => {
    const inputs = { ...blankInputs(), extra: 1 };
    expect(await saveAuditAction(input({ inputs }))).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveAuditAction({ auditId: "nope" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveAuditAction(input({ expectedUpdatedAt: "yesterday" }))).toMatchObject({ ok: false, code: "invalid" });
  });

  test("someone else's audit: refused plainly, nothing written; an admin may write", async () => {
    ownerId = "u2";
    expect(await saveAuditAction(input())).toMatchObject({ ok: false, code: "forbidden" });
    expect(calls).toEqual([]);
    role = "admin";
    expect(await saveAuditAction(input())).toMatchObject({ ok: true });
  });

  test("a missing audit is not found", async () => {
    ownerId = null;
    expect(await saveAuditAction(input())).toMatchObject({ ok: false, code: "not_found" });
  });

  test("no row back (changed since it was read, or refused by RLS) is reported as stale", async () => {
    updateRows = [];
    expect(await saveAuditAction(input())).toMatchObject({ ok: false, code: "stale" });
  });
});

describe("deleteAuditAction", () => {
  test("deletes the owner's audit", async () => {
    expect(await deleteAuditAction({ auditId: AUDIT })).toEqual({ ok: true });
  });
  test("someone else's audit is refused before deleting; an unknown id is not found", async () => {
    ownerId = "u2";
    expect(await deleteAuditAction({ auditId: AUDIT })).toMatchObject({ ok: false, code: "forbidden" });
    expect(calls).toEqual([]);
    expect(await deleteAuditAction({ auditId: "x" })).toMatchObject({ ok: false, code: "not_found" });
  });
  test("no row back is reported", async () => {
    deleteRows = [];
    expect(await deleteAuditAction({ auditId: AUDIT })).toMatchObject({ ok: false, code: "forbidden" });
  });
});
