// Pure role checks on app_metadata, with no server imports, so the proxy
// (src/lib/supabase/middleware.ts) can use them too.

// Staff roles grant access to internal data. 'client' (an external client
// user, with app_metadata.client_id) is a role too, but NEVER a staff role:
// staffRole() is the same list as has_staff_role() in SQL and STAFF_ROLES in
// parse-admin-input.ts, and role-list-sync.test.ts fails if 'client' is
// added to any of them.
export type StaffRole = "admin" | "logistics_expert";
export type UserRole = StaffRole | "client";

// The staff role an admin assigned in app_metadata, or null (no role, an
// invalid one, or a client user). Only a staff role may see or change
// internal data.
export function staffRole(appMetadata: Record<string, unknown> | null | undefined): StaffRole | null {
  const role = appMetadata?.role;
  return role === "admin" || role === "logistics_expert" ? role : null;
}

// Any valid role, client included. Use staffRole() for access decisions.
export function userRole(appMetadata: Record<string, unknown> | null | undefined): UserRole | null {
  return staffRole(appMetadata) ?? (appMetadata?.role === "client" ? "client" : null);
}
