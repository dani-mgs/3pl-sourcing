import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { THREE_PL_PROJECT_FIELDS } from "@/lib/three-pl/parse-project-form";

// The 3PL intake (QA B-9): the whole form is validated before anything is
// saved, and a new client is created only together with its project, through
// create_three_pl_project_with_client (one transaction, pgTAP 25). An
// existing client or an edit keeps the plain insert/update. Supabase is a
// small in-memory fake.

type Client = { id: string; name: string; business_model: string | null };

let clients: Client[] = [];
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
// Replaces the function's default (successful) behaviour for one test.
let rpcImpl: ((args: Record<string, unknown>) => RpcResult) | null = null;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const writes: string[] = [];

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (rpcImpl) return rpcImpl(args);
      // Default: the function succeeds, creating the client with the project.
      clients.push({ id: `c${clients.length + 1}`, name: args.p_client_name as string, business_model: null });
      return { data: "p-new", error: null };
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
          writes.push(`insert ${table}`);
          if (table === "clients") clients.push({ id: "c-direct", name: row.name as string, business_model: null });
          return { select: () => ({ single: async () => ({ data: { id: table === "clients" ? "c-direct" : "p-existing" }, error: null }) }) };
        },
        update: () => {
          writes.push(`update ${table}`);
          return { eq: () => ({ select: async () => ({ data: [{ id: "p-edit" }], error: null }) }) };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { saveClientIntake } = await import("./actions");

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  const all = {
    client_mode: "new",
    new_client_name: "ZZQA Orphan Test",
    new_client_business_model: "B2C",
    target_geography: "US West",
    contract_period_months: "36",
    avg_monthly_orders: "1200",
    intent: "continue",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) if (value !== "") data.set(key, value);
  return data;
}

beforeEach(() => {
  clients = [{ id: "c-acme", name: "Acme Co", business_model: "B2B" }];
  rpcImpl = null;
  rpcCalls.length = 0;
  writes.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("a new project with a new client", () => {
  test("a submit that fails validation creates nothing (B-9 repro)", async () => {
    const invalid: Record<string, string>[] = [{ contract_period_months: "0" }, { avg_monthly_orders: "-5" }, { contract_period_months: "1.5" }];
    for (const bad of invalid) {
      const result = await saveClientIntake(null, form(bad));
      expect(result.error).toBeTruthy();
    }
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
    expect(clients.map((c) => c.name)).toEqual(["Acme Co"]);
    expect(redirect).not.toHaveBeenCalled();
  });

  test("a missing client name creates nothing", async () => {
    expect(await saveClientIntake(null, form({ new_client_name: "   " }))).toEqual({ error: "Client name is required." });
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("success creates the client and project together, in one call", async () => {
    await expect(saveClientIntake(null, form())).rejects.toThrow("REDIRECT /3pl-sourcing/new/p-new/providers");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("create_three_pl_project_with_client");
    expect(rpcCalls[0].args).toMatchObject({ p_client_name: "ZZQA Orphan Test", p_client_business_model: "B2C" });
    const project = rpcCalls[0].args.p_project as Record<string, unknown>;
    expect(Object.keys(project).sort()).toEqual([...THREE_PL_PROJECT_FIELDS].sort());
    expect(project).toMatchObject({ target_geography: "US West", contract_period_months: 36, avg_monthly_orders: 1200 });
    // Never sent by the form: the function sets them.
    expect(project).not.toHaveProperty("owner_id");
    expect(project).not.toHaveProperty("client_id");
    expect(writes).toEqual([]);
  });

  test("a draft goes back to the project list", async () => {
    await expect(saveClientIntake(null, form({ intent: "draft" }))).rejects.toThrow("REDIRECT /3pl-sourcing");
    expect(rpcCalls).toHaveLength(1);
  });

  test("a retry after a failed submit works", async () => {
    expect((await saveClientIntake(null, form({ contract_period_months: "0" }))).error).toBeTruthy();
    expect(clients.map((c) => c.name)).toEqual(["Acme Co"]);
    await expect(saveClientIntake(null, form())).rejects.toThrow("REDIRECT /3pl-sourcing/new/p-new/providers");
    expect(rpcCalls).toHaveLength(1);
    expect(clients.map((c) => c.name)).toEqual(["Acme Co", "ZZQA Orphan Test"]);
  });

  test("a name that's taken returns the message and the client to use instead, and saves nothing", async () => {
    const result = await saveClientIntake(null, form({ new_client_name: "  acme co " }));
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
    expect(await saveClientIntake(null, form({ new_client_name: "Raced Co" }))).toEqual({
      error: 'A client named "Raced Co" already exists.',
      existingClient: { id: "c-raced", name: "Raced Co", business_model: null },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  test("any other failure gives a plain error and no redirect", async () => {
    rpcImpl = () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    expect(await saveClientIntake(null, form())).toEqual({ error: "An unexpected error occurred." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("an existing client, or an edit", () => {
  test("an existing client uses the plain insert, not the function", async () => {
    await expect(saveClientIntake(null, form({ client_mode: "existing", client_id: "c-acme" }))).rejects.toThrow(
      "REDIRECT /3pl-sourcing/new/p-existing/providers",
    );
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual(["insert three_pl_projects"]);
  });

  test("an invalid form with an existing client writes nothing either", async () => {
    expect((await saveClientIntake(null, form({ client_mode: "existing", client_id: "c-acme", contract_period_months: "999" }))).error).toBeTruthy();
    expect(writes).toEqual([]);
  });

  test("an edit can't create a client", async () => {
    expect(await saveClientIntake("p-edit", form())).toEqual({ error: "Choose an existing client for this project." });
    expect(rpcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test("an edit with an existing client updates the project", async () => {
    await expect(saveClientIntake("p-edit", form({ client_mode: "existing", client_id: "c-acme" }))).rejects.toThrow("REDIRECT");
    expect(writes).toEqual(["update three_pl_projects"]);
  });
});
