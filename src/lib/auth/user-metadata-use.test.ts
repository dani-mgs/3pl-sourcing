import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Any signed-in user can rewrite their own user_metadata (auth.updateUser), so
// the app must never read or trust it: names, roles and the tariff-editor flag
// live in app_metadata, which only admins set (docs/SECURITY.md, QA B-3). This
// fails if code under src/ mentions it again. Comments don't count.

const BANNED = /user_metadata|raw_user_meta_data|userMetadata/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("user_metadata use", () => {
  const root = process.cwd();
  const offenders = sourceFiles(path.join(root, "src"))
    .filter((file) => BANNED.test(withoutComments(readFileSync(file, "utf8"))))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));

  test("no code under src/ reads or writes user_metadata", () => {
    expect(offenders).toEqual([]);
  });

  test("the check catches code but ignores comments", () => {
    expect(BANNED.test(withoutComments("const n = user.user_metadata?.first_name;"))).toBe(true);
    expect(BANNED.test(withoutComments("// never user_metadata\nconst n = 1;"))).toBe(false);
    expect(BANNED.test(withoutComments("/* raw_user_meta_data */ const n = 1;"))).toBe(false);
  });
});
