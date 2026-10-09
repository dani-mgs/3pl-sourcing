import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { FORWARDER_PROJECT_FIELDS } from "./parse-project-form";

// create_forwarder_project_with_client() keeps its own list of the forwarder
// project fields: the allow-list of p_project keys, and the insert's column
// and value lists. A field added to the form parser but not to the function
// would be silently dropped for projects created with a new client, so the
// lists must be equal. status is the one exception: the parser has it (the
// edit form sets it), but a new project always starts Active. Read from the
// latest migration that defines the function.

function latestDefinition(): string {
  const dir = path.join(process.cwd(), "supabase/migrations");
  let body: string | null = null;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const match = readFileSync(path.join(dir, file), "utf8").match(
      /create (or replace )?function public\.create_forwarder_project_with_client\([\s\S]*?\$\$([\s\S]*?)\$\$/i,
    );
    if (match) body = match[2];
  }
  if (body == null) throw new Error("no migration defines create_forwarder_project_with_client");
  return body;
}

const quoted = (list: string) => [...list.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

describe("create_forwarder_project_with_client() field lists", () => {
  const body = latestDefinition();
  const fields = FORWARDER_PROJECT_FIELDS.filter((f) => f !== "status").sort();

  test("the parser has status, and the function doesn't accept it", () => {
    expect(FORWARDER_PROJECT_FIELDS).toContain("status");
    expect(fields).not.toContain("status");
  });

  test("the allow-list matches FORWARDER_PROJECT_FIELDS, minus status", () => {
    const allowed = body.match(/v_allowed constant text\[\] := array\[([\s\S]*?)\];/);
    expect(allowed).not.toBeNull();
    expect(quoted(allowed![1]).sort()).toEqual(fields);
  });

  test("the insert writes exactly those columns, plus the three the function sets", () => {
    const columns = body.match(/insert into public\.forwarder_projects \(([\s\S]*?)\)/);
    expect(columns).not.toBeNull();
    const list = columns![1].split(",").map((c) => c.trim());
    expect(list.slice(0, 3)).toEqual(["client_id", "owner_id", "status"]);
    expect(list.slice(3).sort()).toEqual(fields);
    const values = body.match(/\) values \(\s*v_client_id, auth\.uid\(\), 'Active',([\s\S]*?)\)\s*returning/);
    expect(values).not.toBeNull();
    // Each value reads its own column's field, in the same position
    // (incoterms_to_compare through a coalesce, for an empty default).
    const read = [...values![1].matchAll(/\bv\.([a-z_0-9]+)/g)].map((m) => m[1]);
    expect(read).toEqual(list.slice(3));
  });
});
