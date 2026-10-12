import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { STAFF_ROLES } from "@/lib/admin/parse-admin-input";
import { staffRole, userRole } from "./get-user-role";

// The STAFF roles, which grant access to internal data, are listed in three
// places: STAFF_ROLES (the admin forms), staffRole() (the app), and
// has_staff_role() / has_staff_role_user() in SQL (every internal table's
// restrictive policy, and save_duty_estimate). A role added to one and not the
// others would lock its users out, or let them in, in only part of the app.
//
// 'client' is a role but NOT a staff role. If a test here fails because a
// client can't reach something, the fix is never to add 'client' to these
// lists: that would open every internal table to external client users.
// Client access goes through its own policies (client_entitlements) and, from
// Phase 2, published snapshots.

function latestDefinition(fn: string): string {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pattern = new RegExp(`create (or replace )?function public\\.${fn}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i");
  let body: string | null = null;
  for (const file of files) {
    const match = readFileSync(path.join(dir, file), "utf8").match(pattern);
    if (match) body = match[2];
  }
  if (body == null) throw new Error(`no migration defines ${fn}`);
  return body;
}

function rolesIn(body: string): string[] {
  const list = body.match(/->>\s*'role'\s+in\s*\(([^)]*)\)/i);
  if (!list) throw new Error("no role list found");
  return [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe("the staff role list", () => {
  test.each(["has_staff_role", "has_staff_role_user"])("%s() in SQL matches STAFF_ROLES", (fn) => {
    expect(rolesIn(latestDefinition(fn))).toEqual([...STAFF_ROLES].sort());
  });

  test.each(["has_staff_role", "has_staff_role_user"])("%s() never includes 'client'", (fn) => {
    expect(rolesIn(latestDefinition(fn)), "adding 'client' would open every internal table to client users").not.toContain(
      "client",
    );
  });

  test("STAFF_ROLES never includes 'client'", () => {
    expect([...STAFF_ROLES] as string[], "client users must never get a staff role").not.toContain("client");
  });

  test("staffRole() accepts exactly STAFF_ROLES", () => {
    for (const role of STAFF_ROLES) expect(staffRole({ role })).toBe(role);
    for (const meta of [{}, { role: "client" }, { role: "superuser" }, { role: null }, { role: "Admin" }, null, undefined]) {
      expect(staffRole(meta)).toBeNull();
    }
  });

  test("userRole() adds 'client' and nothing else", () => {
    for (const role of STAFF_ROLES) expect(userRole({ role })).toBe(role);
    expect(userRole({ role: "client", client_id: "x" })).toBe("client");
    for (const meta of [{}, { role: "Client" }, { role: "superuser" }, null, undefined]) {
      expect(userRole(meta)).toBeNull();
    }
  });

  test("the client helpers check exactly the 'client' role", () => {
    for (const fn of ["is_client_user", "my_client_id", "complete_password_change"]) {
      expect(latestDefinition(fn)).toMatch(/->>\s*'role'\s*=\s*'client'/);
    }
  });

  test("the old has_app_role() names are dropped and not used again", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const dropAt = files.findIndex((f) => /drop function public\.has_app_role\(\)/i.test(readFileSync(path.join(dir, f), "utf8")));
    expect(dropAt).toBeGreaterThanOrEqual(0);
    for (const file of files.slice(dropAt + 1)) {
      expect(readFileSync(path.join(dir, file), "utf8"), file).not.toMatch(/has_app_role/);
    }
  });
});
