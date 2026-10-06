import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The HTS lookup popup's server actions: signed-in users only, input
// validated before any database call, row limits fixed on the server, the
// user's own Supabase client (never the service role), and a generic message
// for anything unexpected while the real error is only logged.

const rpc = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(async () => ({ auth: { getUser }, rpc }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin-client", () => {
  throw new Error("the lookup must never use the service role");
});

const { searchHtsAction, browseHtsHeadingAction } = await import("./hts-lookup-actions");

const ROW = {
  hts_code: "6402993160",
  indent: 3,
  description: "Other",
  ancestor_descriptions: ["Other footwear:"],
  units: ["prs."],
  general_rate: "6%",
  rate_from_code: "64029931",
  has_children: false,
  parents: [],
  may_apply: [],
  total_count: 1,
};

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockResolvedValue({ data: [ROW], error: null });
});
afterEach(() => vi.clearAllMocks());

describe("searchHtsAction", () => {
  test("keywords: parsed, searched as the signed-in user with the server's limit", async () => {
    const result = await searchHtsAction("Rubber, FOOTWEAR");
    expect(result).toMatchObject({ ok: true, kind: "keywords", total: 1, lines: [{ hts_code: "6402993160" }] });
    expect(rpc).toHaveBeenCalledWith("search_hts_lines", { p_terms: ["rubber", "footwear"], p_limit: 150 });
  });

  test("a code searches the subtree", async () => {
    await searchHtsAction("6402.99");
    expect(rpc).toHaveBeenCalledWith("search_hts_lines", { p_code: "640299", p_limit: 150 });
  });

  test("the browser can't choose the limit or send extra arguments", async () => {
    // Extra arguments a hand-made request might add.
    await (searchHtsAction as (...args: unknown[]) => ReturnType<typeof searchHtsAction>)("footwear", 100000);
    expect(rpc.mock.calls[0][1]).toEqual({ p_terms: ["footwear"], p_limit: 150 });
  });

  test("no user: refused before any database call", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await searchHtsAction("footwear")).toEqual({ ok: false, error: "Your session has expired. Sign in again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["", "Enter words or an HTS code to search for."],
    ["   ", "Enter words or an HTS code to search for."],
    ["a".repeat(101), "Keep the search under 100 characters."],
    ["a b c d e f g h i", "Use up to 8 words."],
    ["6", "Enter 2 to 10 digits of an HTS code, e.g. 6402 or 6402.99."],
    [undefined, "Enter words or an HTS code to search for."],
    [{ q: "x" }, "Enter words or an HTS code to search for."],
  ])("invalid input %j is refused without touching the database", async (input, error) => {
    expect(await searchHtsAction(input)).toEqual({ ok: false, error });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a database error is logged, and the user gets a generic message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "relation hts_lines is broken", code: "XX000" } });
    const result = await searchHtsAction("footwear");
    expect(result).toEqual({ ok: false, error: "The search didn't work. Try again, or try different words." });
    expect(JSON.stringify(result)).not.toMatch(/hts_lines|XX000/);
    expect(log).toHaveBeenCalledWith("searchHtsAction error:", expect.objectContaining({ code: "XX000" }));
    log.mockRestore();
  });

  test("a row that isn't in the expected shape is an error, not passed through", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: [{ ...ROW, hts_code: "64.02" }], error: null });
    expect(await searchHtsAction("footwear")).toMatchObject({ ok: false });
    log.mockRestore();
  });
});

describe("browseHtsHeadingAction", () => {
  test("a 4-digit heading returns its lines, with the browse limit", async () => {
    expect(await browseHtsHeadingAction("6402")).toMatchObject({ ok: true, kind: "heading" });
    expect(rpc).toHaveBeenCalledWith("search_hts_lines", { p_code: "6402", p_limit: 500 });
  });

  test.each(["640", "64029", "6402.99", "abcd", "", null, undefined, 6402])("%j isn't a heading", async (input) => {
    expect(await browseHtsHeadingAction(input)).toEqual({ ok: false, error: "Choose a 4-digit heading, e.g. 6402." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("no user: refused", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await browseHtsHeadingAction("6402")).toEqual({ ok: false, error: "Your session has expired. Sign in again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a database error gets the generic message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await browseHtsHeadingAction("6402")).toEqual({
      ok: false,
      error: "The search didn't work. Try again, or try different words.",
    });
    log.mockRestore();
  });
});
