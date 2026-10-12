// SERVICE-ROLE EXCEPTION #3 (docs/SECURITY.md, "Service-role exception:
// client users"). The only code that creates client users or resets their
// passwords. Because logistics experts may call it too, it is written so it
// can't be used to escalate privileges:
//
// - It checks its caller itself (staff to create; admin to reset), whoever
//   imports it, and validates every input.
// - It only ever CREATES accounts (auth.admin.createUser). An email that
//   already exists is refused, so no existing account (staff or client) can
//   be taken over, renamed or re-roled through it.
// - The app_metadata it writes is built from literals: role is always
//   'client', client_id is a client the caller can read (and, for an expert,
//   a client of a project they own). Nothing from the input is spread into
//   it, and user_metadata is never set. The database backs this up: a client
//   user without a real client_id can't exist (profiles foreign key + check).
// - The reset only touches an account whose CURRENT role is 'client', and
//   only sets a new password plus must_change_password.
// - The one-time password is returned once to the caller and is never
//   stored or logged; errors log only their code.
//
// create-client-user.test.ts checks the source for all of this. Don't add
// other service-role calls here: anything else needs its own review and its
// own entry in service-role-use.test.ts.

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { staffRole } from "@/lib/auth/get-user-role";
import { parseCreateClientUser, parseResetClientUserPassword } from "@/lib/admin/parse-admin-input";

export type ClientUserResult =
  | { ok: true; email: string; oneTimePassword: string }
  | { ok: false; error: string };

export const NO_PERMISSION = "You don't have permission to make this change.";
export const NOT_YOUR_CLIENT =
  "You can only add portal users for clients of projects you own. Ask an admin to add this user.";
const UNEXPECTED = "An unexpected error occurred.";

// 24 random URL-safe characters (144 bits) plus a fixed tail, so any
// letter/digit/symbol rule the Auth settings have is always met.
export function generateOneTimePassword(): string {
  return `${randomBytes(18).toString("base64url")}-7aK`;
}

export async function createClientUserAccount(raw: {
  clientId: unknown;
  email: unknown;
  firstName: unknown;
}): Promise<ClientUserResult> {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  const callerRole = staffRole(caller?.app_metadata);
  if (!caller || !callerRole) return { ok: false, error: NO_PERMISSION };

  const parsed = parseCreateClientUser(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { clientId, email, firstName } = parsed.data;

  // Read as the caller (RLS): the client must exist and be visible to staff.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) {
    console.error("createClientUserAccount client lookup failed:", clientError.code);
    return { ok: false, error: UNEXPECTED };
  }
  if (!client) return { ok: false, error: "Choose a client from the list." };

  // Experts: only for a client of a project they own, in either module.
  if (callerRole !== "admin") {
    const counts = await Promise.all(
      (["three_pl_projects", "forwarder_projects"] as const).map((table) =>
        supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("owner_id", caller.id),
      ),
    );
    const countError = counts.find((r) => r.error)?.error;
    if (countError) {
      console.error("createClientUserAccount ownership check failed:", countError.code);
      return { ok: false, error: UNEXPECTED };
    }
    if (counts.every((r) => (r.count ?? 0) === 0)) return { ok: false, error: NOT_YOUR_CLIENT };
  }

  const oneTimePassword = generateOneTimePassword();
  const serviceRole = createAdminClient();
  const { error } = await serviceRole.auth.admin.createUser({
    email,
    password: oneTimePassword,
    email_confirm: true,
    app_metadata: { role: "client", client_id: clientId, first_name: firstName, must_change_password: true },
  });
  if (error) {
    if (error.code === "email_exists") return { ok: false, error: "A user with that email already exists." };
    console.error("createClientUserAccount createUser failed:", error.code);
    return { ok: false, error: UNEXPECTED };
  }
  return { ok: true, email, oneTimePassword };
}

// Admin only. There are no reset emails (no SMTP), so a client who loses
// their password gets a new one-time password from an admin, and must change
// it again at their next sign-in.
export async function resetClientUserPassword(raw: { userId: unknown }): Promise<ClientUserResult> {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (staffRole(caller?.app_metadata) !== "admin") return { ok: false, error: NO_PERMISSION };

  const parsed = parseResetClientUserPassword(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { userId } = parsed.data;

  const serviceRole = createAdminClient();
  const { data: target, error: lookupError } = await serviceRole.auth.admin.getUserById(userId);
  if (lookupError || !target?.user) {
    if (lookupError) console.error("resetClientUserPassword lookup failed:", lookupError.code);
    return { ok: false, error: "That user no longer exists. Reload the page." };
  }
  // The role as stored now, not as the page showed it.
  if (target.user.app_metadata?.role !== "client" || !target.user.app_metadata?.client_id) {
    return { ok: false, error: "Only client users' passwords can be reset here." };
  }

  const oneTimePassword = generateOneTimePassword();
  // app_metadata keys are merged, so role and client_id stay as they are.
  const { error } = await serviceRole.auth.admin.updateUserById(userId, {
    password: oneTimePassword,
    app_metadata: { must_change_password: true },
  });
  if (error) {
    console.error("resetClientUserPassword update failed:", error.code);
    return { ok: false, error: UNEXPECTED };
  }
  return { ok: true, email: target.user.email ?? "", oneTimePassword };
}
