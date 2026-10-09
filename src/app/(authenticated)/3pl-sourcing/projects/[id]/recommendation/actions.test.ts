import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// saveRecommendation (QA B-5): the top three must be 3PLs of this project,
// checked here and by the database.
// Supabase is a small fake: three_pl_providers holds two projects' 3PLs.

const PROJECT = "00000000-0000-4000-8000-000000000301";
const OTHER = "00000000-0000-4000-8000-000000000302";
const P1 = "00000000-0000-4000-8000-00000000a001";
const P2 = "00000000-0000-4000-8000-00000000a002";
const FOREIGN = "00000000-0000-4000-8000-00000000b001";
const providers = [
  { id: P1, three_pl_project_id: PROJECT },
  { id: P2, three_pl_project_id: PROJECT },
  { id: FOREIGN, three_pl_project_id: OTHER },
];
const writes: Record<string, unknown>[] = [];
// Replaces the insert's (successful) result for one test.
let insertError: { code: string; message: string } | null = null;

function stubClient() {
  return {
    from(table: string) {
      const filters: { col: string; values: string[] }[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, value: string) => {
          filters.push({ col, values: [value] });
          return chain;
        },
        in: async (col: string, values: string[]) => {
          filters.push({ col, values });
          const rows = providers.filter((p) => filters.every((f) => f.values.includes(p[f.col as keyof typeof p])));
          return { data: rows.map((p) => ({ id: p.id })), error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: (row: Record<string, unknown>) => {
          if (insertError) return { select: async () => ({ data: null, error: insertError }) };
          writes.push({ table, ...row });
          return { select: async () => ({ data: [row], error: null }) };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { saveRecommendation } = await import("./actions");

function form(ids: (string | null)[]) {
  const data = new FormData();
  data.set("priority", "Cost Savings");
  ids.forEach((id, i) => id && data.set(`provider_id_${i + 1}`, id));
  return data;
}

beforeEach(() => {
  writes.length = 0;
  insertError = null;
});
afterEach(() => vi.clearAllMocks());

describe("saveRecommendation", () => {
  test("saves a top three from this project", async () => {
    expect(await saveRecommendation(PROJECT, form([P1, P2, null]))).toEqual({ success: true });
    expect(writes).toHaveLength(1);
  });

  test("refuses a 3PL from another project and saves nothing (B-5 repro)", async () => {
    expect(await saveRecommendation(PROJECT, form([P1, FOREIGN, null]))).toEqual({ error: "Choose 3PLs from this project." });
    expect(await saveRecommendation(PROJECT, form([FOREIGN, null, null]))).toEqual({ error: "Choose 3PLs from this project." });
    expect(writes).toEqual([]);
  });

  test("refuses an id that isn't a 3PL at all", async () => {
    expect(await saveRecommendation(PROJECT, form(["00000000-0000-4000-8000-00000000c999"]))).toEqual({
      error: "Choose 3PLs from this project.",
    });
    expect(writes).toEqual([]);
  });

  test("the same 3PL twice is checked once", async () => {
    expect(await saveRecommendation(PROJECT, form([P1, P1, null]))).toEqual({ success: true });
  });

  test("the database's refusal (a 3PL deleted after the check) gives the same message", async () => {
    // Each slot's foreign key includes the project (pgTAP 26).
    insertError = { code: "23503", message: "violates foreign key constraint" };
    expect(await saveRecommendation(PROJECT, form([P1, null, null]))).toEqual({ error: "Choose 3PLs from this project." });
  });

  test("an empty top three is still allowed", async () => {
    expect(await saveRecommendation(PROJECT, form([null, null, null]))).toEqual({ success: true });
  });
});
