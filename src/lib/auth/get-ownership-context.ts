import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "./get-user-role";

export type OwnershipContext = {
  isOwner: boolean;
  isAdmin: boolean;
  canWrite: boolean;
};

export async function getOwnershipContext(
  clientRequirementId: string,
): Promise<OwnershipContext> {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: clientRequirement },
    role,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("client_requirements")
      .select("owner_id")
      .eq("id", clientRequirementId)
      .single(),
    getUserRole(),
  ]);

  const isOwner = Boolean(user && clientRequirement?.owner_id === user.id);
  const isAdmin = role === "admin";

  return { isOwner, isAdmin, canWrite: isOwner || isAdmin };
}

export type ClientOwner = {
  displayName: string;
};

export async function getClientOwner(
  clientRequirementId: string,
): Promise<ClientOwner | null> {
  const supabase = await createClient();

  const { data: clientRequirement } = await supabase
    .from("client_requirements")
    .select("owner_id")
    .eq("id", clientRequirementId)
    .single();

  if (!clientRequirement) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name")
    .eq("id", clientRequirement.owner_id)
    .single();

  if (!profile) {
    return null;
  }

  const displayName = profile.first_name?.trim() || profile.email;

  return { displayName };
}
