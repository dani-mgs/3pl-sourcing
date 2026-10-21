import { beforeEach, describe, expect, test, vi } from "vitest";

// Behind LANDED_COST_ENABLED, the Landed Cost pages don't exist: off, both
// call notFound() before reading anything.

let enabled = false;
const createClient = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({}) }));
vi.mock("@/lib/landed-cost/feature-flag", () => ({ isLandedCostEnabled: () => enabled }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { default: ListPage } = await import("./page");
const { default: WorkspacePage } = await import("./[id]/page");

beforeEach(() => {
  enabled = false;
  createClient.mockClear();
  notFound.mockClear();
});

describe("flag off", () => {
  test("/landed-cost is a 404, with no database read", async () => {
    await expect(ListPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
    expect(createClient).not.toHaveBeenCalled();
  });

  test("/landed-cost/[id] is a 404, with no database read", async () => {
    const params = Promise.resolve({ id: "00000000-0000-4000-8000-000000000301" });
    await expect(WorkspacePage({ params } as never)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("flag on", () => {
  test("the pages go on to read with the user's client", async () => {
    enabled = true;
    createClient.mockRejectedValue(new Error("stop here"));
    await expect(ListPage()).rejects.toThrow("stop here");
    expect(createClient).toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
