import type { SupabaseClient } from "@supabase/supabase-js";

// A client (company) is a shared record in `clients`; each 3PL sourcing
// engagement for it is a `three_pl_projects` row pointing at it via
// client_id. Names are unique case-insensitively after trimming (enforced by
// the clients_name_unique index on lower(trim(name))), and every write here
// stores the trimmed name.

export type ClientOption = {
  id: string;
  name: string;
  business_model: string | null;
};

export const CLIENT_SELECT = "id, name, business_model" as const;

// What the "Which client?" picker has chosen for a project.
export type ClientSelection =
  | { mode: "existing"; clientId: string | null }
  | { mode: "new"; name: string; businessModel: string };

export function defaultClientSelection(
  clients: ClientOption[],
): ClientSelection {
  return clients.length > 0
    ? { mode: "existing", clientId: null }
    : { mode: "new", name: "", businessModel: "" };
}

export const UNIQUE_VIOLATION = "23505";

export function normalizeClientName(name: string): string {
  return name.trim().toLowerCase();
}

export function duplicateClientMessage(name: string): string {
  return `A client named "${name}" already exists.`;
}

// Supabase returns an embedded many-to-one relation (e.g. a project's
// `clients(...)`) as either a single object or a one-element array depending
// on how the relationship is inferred, so normalize it in one place.
export function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ilike without wildcards is a case-insensitive equality match; escape the
// LIKE metacharacters so a name containing % or _ matches only itself.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function findClientByName(
  supabase: SupabaseClient,
  name: string,
): Promise<ClientOption | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .ilike("name", escapeLike(name.trim()))
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findClientByName error:", error);
    return null;
  }
  return data;
}

export async function listClients(
  supabase: SupabaseClient,
): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .order("name", { ascending: true });

  if (error) {
    console.error("listClients error:", error);
    return [];
  }
  return data ?? [];
}
