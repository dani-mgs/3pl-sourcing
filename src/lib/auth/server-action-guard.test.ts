import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

// Server Actions are reachable by a direct POST from any route, whatever the
// proxy allows, so each one checks the caller itself, as its FIRST statement:
//   - staff actions (src/app/(authenticated)): `await requireStaff()`, or the
//     admin check `if ((await getUserRole()) !== "admin")` in /admin;
//   - portal actions (src/app/portal): `await requireClient()`.
// Only sign-in and sign-out run without one. A new action without its guard
// fails here (client dashboard plan, Phase 1).

const ROOT = process.cwd();
const UNGUARDED = new Set(["src/app/login/actions.ts", "src/app/logout/actions.ts"]);
const STAFF_GUARD = /^(const \w+ = )?await requireStaff\(\);$/;
const ADMIN_GUARD = /^if \(\(await getUserRole\(\)\) !== "admin"\) \{/;
const CLIENT_GUARD = /^(const \w+ = )?await requireClient\(\);$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

// A file whose first statement is the "use server" directive.
function isServerActionFile(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return Boolean(
    first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server",
  );
}

type Export = { name: string; firstStatement: string | null; isFunction: boolean };

function exportsOf(sf: ts.SourceFile): Export[] {
  const out: Export[] = [];
  for (const node of sf.statements) {
    const mods = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(node)) {
      const first = node.body?.statements[0];
      out.push({ name: node.name?.text ?? "default", firstStatement: first ? first.getText(sf) : null, isFunction: true });
    } else if (!ts.isTypeAliasDeclaration(node) && !ts.isInterfaceDeclaration(node)) {
      out.push({ name: node.getText(sf).slice(0, 60), firstStatement: null, isFunction: false });
    }
  }
  return out;
}

const actionFiles = sourceFiles(path.join(ROOT, "src"))
  .map((file) => ({ file: relative(file), sf: parse(file) }))
  .filter(({ sf }) => isServerActionFile(sf));

describe("server action guards", () => {
  test("the scan finds the action files (it isn't vacuous)", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(30);
    expect(actionFiles.map((f) => f.file)).toContain("src/app/(authenticated)/admin/actions.ts");
    expect(actionFiles.map((f) => f.file)).toContain("src/app/(authenticated)/landed-cost/actions.ts");
  });

  test("every action file lives where a guard rule applies", () => {
    const misplaced = actionFiles
      .map((f) => f.file)
      .filter(
        (file) =>
          !UNGUARDED.has(file) && !file.startsWith("src/app/(authenticated)/") && !file.startsWith("src/app/portal/"),
      );
    expect(misplaced).toEqual([]);
  });

  test("action files export only functions (an exported const arrow would escape this scan)", () => {
    const others = actionFiles.flatMap(({ file, sf }) =>
      exportsOf(sf).filter((e) => !e.isFunction).map((e) => `${file}: ${e.name}`),
    );
    expect(others).toEqual([]);
  });

  test("every staff action checks the role first", () => {
    const missing = actionFiles
      .filter(({ file }) => file.startsWith("src/app/(authenticated)/"))
      .flatMap(({ file, sf }) =>
        exportsOf(sf)
          .filter((e) => {
            const first = e.firstStatement ?? "";
            if (STAFF_GUARD.test(first)) return false;
            return !(file.startsWith("src/app/(authenticated)/admin/") && ADMIN_GUARD.test(first));
          })
          .map((e) => `${file}: ${e.name}`),
      );
    expect(missing).toEqual([]);
  });

  test("every portal action checks for a client user first", () => {
    const missing = actionFiles
      .filter(({ file }) => file.startsWith("src/app/portal/"))
      .flatMap(({ file, sf }) =>
        exportsOf(sf)
          .filter((e) => !CLIENT_GUARD.test(e.firstStatement ?? ""))
          .map((e) => `${file}: ${e.name}`),
      );
    expect(missing).toEqual([]);
  });

  test("the guard throws for anyone without a staff role", () => {
    const source = readFileSync(path.join(ROOT, "src/lib/auth/require-staff.ts"), "utf8");
    expect(source).toMatch(/const role = await getStaffRole\(\);\s*if \(!role\) notFound\(\);/);
  });
});
