import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toForwarderSource } from "@/lib/client-updates/load-publish-source";
import { forwarderId, forwarderProjectRow, forwarderRows, quoteRows } from "@/lib/client-updates/__fixtures__/sources";

// Share update with client: the payload is always rebuilt on the server,
// Publish refuses anything but a current preview, only the owner or an
// admin can share, and only admins remove a published update. Supabase is a
// small fake that records writes.

const PROJECT = "00000000-0000-4000-8000-000000000401";
const writes: { op: string; table: string; row?: unknown }[] = [];
let draftId: string | null = null;
let deleteRows: { id: string }[] = [{ id: "u1" }];

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "author-1" } } }) },
    from(table: string) {
      let op = "select";
      let row: unknown;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: table === "client_updates" && draftId ? { id: draftId } : null, error: null }),
        single: async () => {
          writes.push({ op, table, row });
          return { data: { id: "new-draft" }, error: null };
        },
        insert: (r: unknown) => {
          op = "insert";
          row = r;
          return chain;
        },
        update: (r: unknown) => {
          op = "update";
          row = r;
          writes.push({ op, table, row });
          return chain;
        },
        upsert: async (r: unknown) => {
          writes.push({ op: "upsert", table, row: r });
          return { error: null };
        },
        delete: () => {
          writes.push({ op: "delete", table });
          return { eq: () => ({ eq: () => ({ select: async () => ({ data: deleteRows, error: null }), eq: () => ({ select: async () => ({ data: deleteRows, error: null }) }) }) }) };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve(table === "profiles" ? { data: [{ id: "author-1", first_name: "Beah" }], error: null } : { data: null, error: null }),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
const requireStaff = vi.fn(async () => "logistics_expert");
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff }));
const canWrite = vi.fn(() => true);
vi.mock("@/lib/auth/get-ownership-context", () => ({
  getOwnershipContext: async () => ({ isOwner: canWrite(), isAdmin: false, canWrite: canWrite() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/client-updates/load-publish-source", async (original) => ({
  ...(await original<typeof import("@/lib/client-updates/load-publish-source")>()),
  loadForwarderSource: async () => ({
    source: toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows()),
    meta: { ownerId: "author-1", clientId: "c1", clientName: "Fixture Apparel" },
  }),
  loadFirstNames: async () => new Map([["author-1", "Beah"]]),
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const actions = await import("./actions");

function form(fields: Record<string, string | string[]> = {}) {
  const data = new FormData();
  const all: Record<string, string | string[]> = {
    stage: "5",
    headline: "Your forwarder recommendation is ready",
    summary: "We compared every like-for-like quote.",
    partnerIds: [forwarderId(0), forwarderId(1)],
    recommendedId: forwarderId(0),
    section_cost: "on",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) for (const one of [v].flat()) data.append(k, one);
  return data;
}

beforeEach(() => {
  writes.length = 0;
  draftId = null;
  deleteRows = [{ id: "u1" }];
  canWrite.mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("previewClientUpdate", () => {
  test("returns what the client would see, built on the server, and its fingerprint", async () => {
    const result = await actions.previewClientUpdate("forwarder", PROJECT, form());
    if ("error" in result) throw new Error(result.error);
    expect(result.view.payload.comparison.options.map((o) => o.name)).toEqual(["Pacific Bridge Logistics", "Lotus Freight"]);
    expect(result.view.publishedAt).toBeNull();
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(writes).toEqual([]);
  });

  test("figures sent by the browser are ignored (the payload is rebuilt)", async () => {
    const result = await actions.previewClientUpdate("forwarder", PROJECT, form({ payload: '{"costUsd":1}', costUsd: "1" }));
    if ("error" in result) throw new Error(result.error);
    const payload = result.view.payload;
    if (payload.kind !== "forwarder") throw new Error("expected a forwarder payload");
    expect(payload.comparison.options[0].costUsd).toBe(9000);
  });

  test("someone who isn't the owner or an admin is refused", async () => {
    canWrite.mockReturnValue(false);
    expect(await actions.previewClientUpdate("forwarder", PROJECT, form())).toEqual({
      error: "Only the project's owner or an admin can share updates with its client.",
    });
  });

  test("a partner off the shortlist can't be named", async () => {
    const result = await actions.previewClientUpdate("forwarder", PROJECT, form({ partnerIds: [forwarderId(3)], recommendedId: "" }));
    expect(result).toEqual({ error: expect.stringMatching(/Only shortlisted partners/) });
  });

  test.each([
    ["kind", "admin", PROJECT],
    ["project id", "forwarder", "../../etc"],
  ])("a tampered %s is refused", async (_label, kind, project) => {
    expect(await actions.previewClientUpdate(kind as "forwarder", project, form())).toEqual({ error: "This project couldn't be found." });
  });

  test("a client user is refused before anything happens", async () => {
    requireStaff.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(actions.previewClientUpdate("forwarder", PROJECT, form())).rejects.toThrow("404");
  });
});

describe("publishClientUpdate", () => {
  async function previewHash(data = form()) {
    const result = await actions.previewClientUpdate("forwarder", PROJECT, data);
    if ("error" in result) throw new Error(result.error);
    return result.hash;
  }

  test("publishes exactly the preview: saves the draft and its inputs, then publishes it", async () => {
    const hash = await previewHash();
    expect(await actions.publishClientUpdate("forwarder", PROJECT, hash, form())).toEqual({ ok: "Published for Fixture Apparel." });
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual([
      "insert client_updates",
      "upsert client_update_inputs",
      "update client_updates",
    ]);
    expect(writes[0].row).toMatchObject({ forwarder_project_id: PROJECT, is_draft: true, stage: 5 });
    expect(writes[0].row).not.toHaveProperty("client_id");
    expect(writes[0].row).not.toHaveProperty("published_by");
    expect(writes[2].row).toEqual({ is_draft: false });
  });

  test("an existing draft is reused", async () => {
    draftId = "draft-1";
    const hash = await previewHash();
    await actions.publishClientUpdate("forwarder", PROJECT, hash, form());
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual([
      "update client_updates",
      "upsert client_update_inputs",
      "update client_updates",
    ]);
  });

  test("anything changed since the preview is refused, and nothing is written", async () => {
    const hash = await previewHash();
    const result = await actions.publishClientUpdate("forwarder", PROJECT, hash, form({ headline: "Something else" }));
    expect(result).toEqual({ error: expect.stringMatching(/changed since your preview/) });
    expect(writes).toEqual([]);
    expect(await actions.publishClientUpdate("forwarder", PROJECT, "made-up", form())).toEqual({
      error: expect.stringMatching(/changed since your preview/),
    });
  });
});

describe("saveClientUpdateDraft", () => {
  test("saves a draft without publishing it", async () => {
    expect(await actions.saveClientUpdateDraft("forwarder", PROJECT, form())).toEqual({ ok: "Draft saved. The client can't see drafts." });
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual(["insert client_updates", "upsert client_update_inputs"]);
  });

  test("an invalid form saves nothing", async () => {
    expect(await actions.saveClientUpdateDraft("forwarder", PROJECT, form({ stage: "9" }))).toEqual({ error: "Choose a stage." });
    expect(writes).toEqual([]);
  });
});

describe("removePublishedClientUpdate", () => {
  test("experts can't remove a published update", async () => {
    expect(await actions.removePublishedClientUpdate("forwarder", PROJECT, "00000000-0000-4000-8000-00000000d001")).toEqual({
      error: "Only an admin can remove a published update.",
    });
    expect(writes).toEqual([]);
  });

  test("admins can", async () => {
    requireStaff.mockResolvedValueOnce("admin");
    expect(await actions.removePublishedClientUpdate("forwarder", PROJECT, "00000000-0000-4000-8000-00000000d001")).toEqual({
      ok: "Update removed. The client no longer sees it.",
    });
  });
});
