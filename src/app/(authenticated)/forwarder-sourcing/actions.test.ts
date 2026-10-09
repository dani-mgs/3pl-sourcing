import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FORWARDER_PROJECT_FIELDS } from "@/lib/forwarder/parse-project-form";

// The forwarder project save (the forwarder follow-up to QA B-9): the whole
// form is validated before anything is saved, and a new client is created only
// together with its project, through create_forwarder_project_with_client (one
// transaction, pgTAP 27). An existing client or an edit keeps the plain
// insert/update. Supabase is a small in-memory fake.

type Client = { id: string; name: string; business_model: string | null };

let clients: Client[] = [];
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
// Replaces the function's default (successful) behaviour for one test.
let rpcImpl: ((args: Record<string, unknown>) => RpcResult) | null = null;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const writes: { op: string; row?: Record<string, unknown> }[] = [];

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (rpcImpl) return rpcImpl(args);
      // Default: the function succeeds, creating the client with the project.
      clients.push({ id: `c${clients.length + 1}`, name: args.p_client_name as string, business_model: null });
      return { data: "f-new", error: null };
    },
    from(table: string) {
      let nameFilter: string | null = null;
      let idFilter: string | null = null;
      const chain = {
        select: () => chain,
        ilike: (_col: string, value: string) => {
          nameFilter = value.toLowerCase();
          return chain;
        },
        eq: (_col: string, value: string) => {
          idFilter = value;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          if (table !== "clients") return { data: null, error: null };
          const found = clients.find((c) => (nameFilter ? c.name.toLowerCase() === nameFilter : c.id === idFilter));
          return { data: found ?? null, error: null };
        },
        insert: (row: Record<string, unknown>) => {
          writes.push({ op: `insert ${table}`, row });
          if (table === "clients") clients.push({ id: "c-direct", name: row.name as string, business_model: null });
          return { select: () => ({ single: async () => ({ data: { id: "f-existing" }, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          writes.push({ op: `update ${table}`, row });
          return { eq: () => ({ select: async () => ({ data: [{ id: "f-edit" }], error: null }) }) };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
vi.mock("@/lib/auth/get-ownership-context", () => ({
  getOwnershipContext: async () => ({ isOwner: true, isAdmin: false, canWrite: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { saveForwarderProject } = await import("./actions");

const EDIT_ID = "00000000-0000-4000-8000-000000000401";

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  const all = {
    client_mode: "new",
    new_client_name: "ZZQA Forwarder Orphan Test",
    new_client_business_model: "B2B",
    origin_country: "Vietnam",
    project_duration_months: "12",
    shipment_mode: "Sea",
    shipment_type: "FCL",
    hs_code: "0402",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) if (value !== "") data.set(key, value);
  data.append("incoterms_to_compare", "DDP");
  data.append("incoterms_to_compare", "FOB");
  return data;
}

const names = () => clients.map((c) => c.name);

beforeEach(() => {
  clients = [{ id: "c-acme", name: "Acme Co", business_model: "B2B" }];
  rpcImpl = null;
  rpcCalls.length = 0;
  writes.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("a new project with a new client", () => {
  test("a submit that fails validation creates nothing", async () => {
    const invalid: Record<string, string>[] = [
      { project_duration_months: "0" },
      { project_duration_months: "1.5" },
      { pallets: "-5" },
      { shipment_mode: "Air" }, // FCL isn't an air shipment type
    ];
    for (const bad of invalid) {
      const result = await saveForwarderProject(null, form(bad));
      expect(result.error).toBeTruthy();
    }
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
    expect(names()).toEqual(["Acme Co"]);
    expect(redirect).not.toHaveBeenCalled();
  });

  test("a missing client name creates nothing", async () => {
    expect(await saveForwarderProject(null, form({ new_client_name: "   " }))).toEqual({ error: "Client name is required." });
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("success creates the client and project together, in one call", async () => {
    await expect(saveForwarderProject(null, form())).rejects.toThrow("REDIRECT /forwarder-sourcing/f-new");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("create_forwarder_project_with_client");
    expect(rpcCalls[0].args).toMatchObject({ p_client_name: "ZZQA Forwarder Orphan Test", p_client_business_model: "B2B" });
    const project = rpcCalls[0].args.p_project as Record<string, unknown>;
    expect(Object.keys(project).sort()).toEqual(FORWARDER_PROJECT_FIELDS.filter((f) => f !== "status").sort());
    expect(project).toMatchObject({
      origin_country: "Vietnam",
      project_duration_months: 12,
      hs_code: "0402",
      incoterms_to_compare: ["FOB", "DDP"],
    });
    // Never sent by the form: the function sets them.
    expect(project).not.toHaveProperty("status");
    expect(project).not.toHaveProperty("owner_id");
    expect(project).not.toHaveProperty("client_id");
    expect(writes).toEqual([]);
  });

  test("a status in the form is ignored: a new project starts Active", async () => {
    await expect(saveForwarderProject(null, form({ status: "Completed" }))).rejects.toThrow("REDIRECT");
    expect(rpcCalls[0].args.p_project).not.toHaveProperty("status");
  });

  test("a retry after a failed submit works", async () => {
    expect((await saveForwarderProject(null, form({ project_duration_months: "0" }))).error).toBeTruthy();
    expect(names()).toEqual(["Acme Co"]);
    await expect(saveForwarderProject(null, form())).rejects.toThrow("REDIRECT /forwarder-sourcing/f-new");
    expect(rpcCalls).toHaveLength(1);
    expect(names()).toEqual(["Acme Co", "ZZQA Forwarder Orphan Test"]);
  });

  test("a project the database refuses leaves no client (the function rolls back)", async () => {
    rpcImpl = () => ({ data: null, error: { code: "23514", message: "violates check constraint" } });
    expect(await saveForwarderProject(null, form())).toEqual({ error: "An unexpected error occurred." });
    expect(names()).toEqual(["Acme Co"]);
    expect(writes).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });

  test("a name that's taken returns the message and the client to use instead, and saves nothing", async () => {
    const result = await saveForwarderProject(null, form({ new_client_name: "  acme co " }));
    expect(result).toEqual({
      error: 'A client named "Acme Co" already exists.',
      existingClient: { id: "c-acme", name: "Acme Co", business_model: "B2B" },
    });
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("a name taken in the meantime (23505 from the function) gives the same answer", async () => {
    // Someone else creates "Raced Co" between the check and the call.
    rpcImpl = () => {
      clients.push({ id: "c-raced", name: "Raced Co", business_model: null });
      return { data: null, error: { code: "23505", message: "duplicate key" } };
    };
    expect(await saveForwarderProject(null, form({ new_client_name: "Raced Co" }))).toEqual({
      error: 'A client named "Raced Co" already exists.',
      existingClient: { id: "c-raced", name: "Raced Co", business_model: null },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  test("any other failure gives a plain error and no redirect", async () => {
    rpcImpl = () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    expect(await saveForwarderProject(null, form())).toEqual({ error: "An unexpected error occurred." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("an existing client, or an edit", () => {
  test("an existing client uses the plain insert, not the function", async () => {
    await expect(saveForwarderProject(null, form({ client_mode: "existing", client_id: "c-acme" }))).rejects.toThrow(
      "REDIRECT /forwarder-sourcing/f-existing",
    );
    expect(rpcCalls).toEqual([]);
    expect(writes.map((w) => w.op)).toEqual(["insert forwarder_projects"]);
    expect(writes[0].row).toMatchObject({ client_id: "c-acme", owner_id: "u1", status: "Active" });
  });

  test("an invalid form with an existing client writes nothing either", async () => {
    const result = await saveForwarderProject(null, form({ client_mode: "existing", client_id: "c-acme", project_duration_months: "999" }));
    expect(result.error).toBeTruthy();
    expect(writes).toEqual([]);
  });

  test("an edit can't create a client", async () => {
    expect(await saveForwarderProject(EDIT_ID, form())).toEqual({ error: "Choose an existing client for this project." });
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("an edit with an existing client updates the project, keeping its status", async () => {
    await expect(
      saveForwarderProject(EDIT_ID, form({ client_mode: "existing", client_id: "c-acme", status: "On Hold" })),
    ).rejects.toThrow(`REDIRECT /forwarder-sourcing/${EDIT_ID}`);
    expect(writes.map((w) => w.op)).toEqual(["update forwarder_projects"]);
    expect(writes[0].row).toMatchObject({ client_id: "c-acme", status: "On Hold" });
  });
});
