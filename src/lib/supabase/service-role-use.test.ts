import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// The service-role client bypasses RLS, so where it's used is an allow-list
// (docs/SECURITY.md): the two cron routes, the /admin pages after an admin
// check, the estimate store (save_duty_estimate only), the client-user
// file (creating client users, admin-only password resets; its own checks
// are in create-client-user.test.ts), and the Landed Cost snapshot store
// (save_landed_cost_snapshot only, called only by the lock action). A new use
// fails here until it's reviewed and listed.

const ALLOWED = [
  "src/app/(authenticated)/admin/actions.ts",
  "src/app/(authenticated)/admin/page.tsx",
  "src/app/api/cron/fx-rates/route.ts",
  "src/app/api/cron/hts-release/route.ts",
  "src/lib/client-users/create-client-user.ts",
  "src/lib/landed-cost/snapshot-store.ts",
  "src/lib/supabase/admin-client.ts",
  "src/lib/tariff/estimate-store.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("service-role client use", () => {
  const root = process.cwd();
  const users = sourceFiles(path.join(root, "src"))
    .filter((file) => /createAdminClient|admin-client|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .sort();

  test("only the listed files use it", () => {
    expect(users).toEqual([...ALLOWED].sort());
  });

  test("the estimate store calls save_duty_estimate and nothing else", () => {
    const source = readFileSync(path.join(root, "src/lib/tariff/estimate-store.ts"), "utf8");
    expect([...source.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1])).toEqual(["save_duty_estimate"]);
    expect(source).not.toMatch(/\.from\(/);
  });

  test("the snapshot store calls save_landed_cost_snapshot and nothing else", () => {
    const source = readFileSync(path.join(root, "src/lib/landed-cost/snapshot-store.ts"), "utf8");
    expect([...source.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1])).toEqual(["save_landed_cost_snapshot"]);
    expect(source).not.toMatch(/\.from\(|\.auth\.|\.storage\./);
  });

  test("only the Landed Cost actions use the snapshot store, in exactly one call", () => {
    const importers = sourceFiles(path.join(root, "src"))
      .filter((file) => /landed-cost\/snapshot-store/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file).split(path.sep).join("/"));
    expect(importers).toEqual(["src/app/(authenticated)/landed-cost/actions.ts"]);
    const actions = readFileSync(path.join(root, importers[0]), "utf8");
    expect([...actions.matchAll(/saveLandedCostSnapshot\(/g)]).toHaveLength(1);
  });
});
