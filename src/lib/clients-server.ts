// SERVER-ONLY: called from Server Actions with the request's Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLIENT_SELECT,
  UNIQUE_VIOLATION,
  duplicateClientMessage,
  findClientByName,
  type ClientOption,
} from "@/lib/clients";

// existingClient is set when a "new client" name turned out to match an
// existing client, so the form can offer "Use existing client".
export type ResolveClientError = {
  error: string;
  existingClient?: ClientOption;
};

// The "New client" fields, checked but not saved: the name is required and
// mustn't match an existing client (the form then offers "Use existing
// client"). The 3PL intake creates the client together with its project
// (create_three_pl_project_with_client), only after the whole form is valid.
export async function checkNewClient(
  supabase: SupabaseClient,
  formData: FormData,
): Promise<{ name: string; businessModel: string | null } | ResolveClientError> {
  const name = ((formData.get("new_client_name") as string) ?? "").trim();
  if (!name) {
    return { error: "Client name is required." };
  }

  const existing = await findClientByName(supabase, name);
  if (existing) {
    return {
      error: duplicateClientMessage(existing.name),
      existingClient: existing,
    };
  }

  const businessModel = (
    (formData.get("new_client_business_model") as string) ?? ""
  ).trim();
  return { name, businessModel: businessModel || null };
}

// The answer for a client name that turned out to be taken after
// checkNewClient (another expert created it in between).
export async function duplicateClientError(
  supabase: SupabaseClient,
  name: string,
): Promise<ResolveClientError> {
  const raced = await findClientByName(supabase, name);
  return {
    error: duplicateClientMessage(raced?.name ?? name),
    existingClient: raced ?? undefined,
  };
}

// Returns the id of the client a project belongs to, creating the client
// first when the form chose "New client". Reads the ClientPicker's hidden
// fields (client_mode, client_id, new_client_name, new_client_business_model).
// A project being edited can only be moved to another existing client —
// creating or renaming a client there isn't allowed. Shared by every
// module's project save action.
export async function resolveClientId(
  supabase: SupabaseClient,
  formData: FormData,
  isEdit: boolean,
): Promise<{ clientId: string } | ResolveClientError> {
  const mode = formData.get("client_mode") as string;

  if (mode === "new") {
    if (isEdit) {
      return { error: "Choose an existing client for this project." };
    }

    const checked = await checkNewClient(supabase, formData);
    if (!("name" in checked)) {
      return checked;
    }
    const { name, businessModel } = checked;

    const { data, error } = await supabase
      .from("clients")
      .insert({ name, business_model: businessModel })
      .select(CLIENT_SELECT)
      .single();

    if (error) {
      // Another expert created the same client between our check and insert.
      if (error.code === UNIQUE_VIOLATION) {
        console.error("resolveClientId client unique violation:", error);
        return duplicateClientError(supabase, name);
      }
      console.error("resolveClientId client insert error:", error);
      return { error: "An unexpected error occurred." };
    }
    if (!data) {
      return { error: "You don't have permission to make this change." };
    }
    return { clientId: data.id };
  }

  const clientId = formData.get("client_id") as string;
  if (!clientId) {
    return { error: "Choose a client." };
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    console.error("resolveClientId client lookup error:", error);
    return { error: "An unexpected error occurred." };
  }
  if (!data) {
    return { error: "That client no longer exists — choose another." };
  }
  return { clientId: data.id };
}
