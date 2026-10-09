// SERVER-ONLY: called from Server Actions with the request's Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
// client"). Each intake then creates the client together with its project
// (create_three_pl_project_with_client, create_forwarder_project_with_client),
// only after the whole form is valid.
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

// Returns the id of the existing client a project belongs to, from the
// ClientPicker's hidden fields (client_mode, client_id). A new client is never
// created here: each module's intake creates it together with the project
// (create_three_pl_project_with_client, create_forwarder_project_with_client),
// so a failed project insert can't leave it behind. A project being edited
// can only be moved to another existing client.
export async function resolveClientId(
  supabase: SupabaseClient,
  formData: FormData,
  isEdit: boolean,
): Promise<{ clientId: string } | ResolveClientError> {
  if (formData.get("client_mode") === "new") {
    return {
      error: isEdit
        ? "Choose an existing client for this project."
        : "An unexpected error occurred.",
    };
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
