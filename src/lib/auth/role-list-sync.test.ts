import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { USER_ROLES } from "@/lib/admin/parse-admin-input";
import { assignedRole } from "./get-user-role";

// The roles that grant access are listed in three places: USER_ROLES (the
// admin forms), assignedRole() (the app), and has_app_role() /
// has_app_role_user() in SQL (RLS and save_duty_estimate). A role added to one
// and not the others would lock its users out, or let them in, in only part of
// the app. This compares them; the SQL is read from the latest migration that
// defines each function.

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

describe("the allowed role list", () => {
  test.each(["has_app_role", "has_app_role_user"])("%s() in SQL matches USER_ROLES", (fn) => {
    expect(rolesIn(latestDefinition(fn))).toEqual([...USER_ROLES].sort());
  });

  test("assignedRole() accepts exactly USER_ROLES", () => {
    for (const role of USER_ROLES) expect(assignedRole({ role })).toBe(role);
    for (const meta of [{}, { role: "superuser" }, { role: null }, { role: "Admin" }, null, undefined]) {
      expect(assignedRole(meta)).toBeNull();
    }
  });
});
