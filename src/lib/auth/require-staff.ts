import { notFound } from "next/navigation";
import { getStaffRole, type StaffRole } from "./get-user-role";

// The first statement of every staff Server Action (server-action-guard.test.ts
// enforces it). Server Actions are reachable by a direct POST from any route,
// /portal included, so the proxy's routing alone can't keep client users out:
// each action checks for itself. A client user, or an account without a
// role, gets a plain 404, saying nothing about what the action does.
export async function requireStaff(): Promise<StaffRole> {
  const role = await getStaffRole();
  if (!role) notFound();
  return role;
}
