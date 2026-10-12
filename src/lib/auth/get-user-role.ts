import { createClient } from "@/lib/supabase/server";
import { staffRole, userRole, type StaffRole, type UserRole } from "./roles";

// The pure checks live in roles.ts (the proxy uses them too).
export { staffRole, userRole, type StaffRole, type UserRole } from "./roles";

// Shown to an account an admin hasn't given a role yet.
export const NO_ROLE_MESSAGE = "Your account doesn't have a role yet. Ask an admin.";

export async function getUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return userRole(user?.app_metadata);
}

export async function getStaffRole(): Promise<StaffRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return staffRole(user?.app_metadata);
}
