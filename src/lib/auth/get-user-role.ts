import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "logistics_expert";

// Shown to an account an admin hasn't given a role yet.
export const NO_ROLE_MESSAGE = "Your account doesn't have a role yet. Ask an admin.";

// The role an admin assigned in app_metadata, or null when there is none (or
// it isn't valid). Such an account can see and change nothing: the same list
// as has_app_role() in SQL and USER_ROLES (a Vitest check keeps them equal).
export function assignedRole(appMetadata: Record<string, unknown> | null | undefined): UserRole | null {
  const role = appMetadata?.role;
  return role === "admin" || role === "logistics_expert" ? role : null;
}

export async function getUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return assignedRole(user?.app_metadata);
}
