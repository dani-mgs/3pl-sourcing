import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "./get-user-role";

// Every module's project table has an owner_id; these helpers work on any of
// them. 3PL Sourcing is the default so existing callers are unchanged.
export type ProjectTable = "three_pl_projects" | "forwarder_projects";

export type OwnershipContext = {
  isOwner: boolean;
  isAdmin: boolean;
  canWrite: boolean;
};

export async function getOwnershipContext(
  projectId: string,
  table: ProjectTable = "three_pl_projects",
): Promise<OwnershipContext> {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: project },
    role,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from(table).select("owner_id").eq("id", projectId).single(),
    getUserRole(),
  ]);

  const isOwner = Boolean(user && project?.owner_id === user.id);
  const isAdmin = role === "admin";

  return { isOwner, isAdmin, canWrite: isOwner || isAdmin };
}

export type ClientOwner = {
  displayName: string;
};

export async function getClientOwner(
  projectId: string,
  table: ProjectTable = "three_pl_projects",
): Promise<ClientOwner | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from(table)
    .select("owner_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name")
    .eq("id", project.owner_id)
    .single();

  if (!profile) {
    return null;
  }

  const displayName = profile.first_name?.trim() || profile.email;

  return { displayName };
}
