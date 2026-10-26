// Dev only, for the LOCAL Supabase stack: inserts one golden case as a
// Forwarder Audit, so the app can be compared with the workbook it was
// recalculated from. Run: npm run fa:seed-case <case-name> [--owner <email>]
//
// <case-name> is a file in src/lib/forwarder-audit/__fixtures__/golden/
// (Test_Airspeed_FCL, Test_Navilink_LCL, Test_Synthetic_Errors, gen-fcl, ...;
// run the script with no name to list them). The owner is a staff user (the
// first admin or logistics expert when --owner is left out).
//
// The URL and keys come from `npx supabase status -o env` (the local CLI),
// never from .env files, and the script refuses to run unless the URL is the
// local API (127.0.0.1 / localhost, port 54321). The audit is written AS the
// owner (a one-time session from an admin-generated link), because the table
// has no service_role privilege; the service-role key is only used to look
// up and sign in the user. The inputs go through the app's own strict schema.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = path.join(ROOT, "src/lib/forwarder-audit");
const GOLDEN = path.join(LIB, "__fixtures__/golden");
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";

function fail(message) {
  console.error(`fa:seed-case: ${message}`);
  process.exit(1);
}

function localStack() {
  let out;
  try {
    out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    fail("Couldn't read the local Supabase status. Start it with `npx supabase start`.");
  }
  const env = {};
  for (const line of out.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  let url;
  try {
    url = new URL(env.API_URL);
  } catch {
    fail("The local Supabase status has no API_URL.");
  }
  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== LOCAL_PORT) {
    fail(`Refusing ${url.origin}: only the local stack (http://127.0.0.1:${LOCAL_PORT}) is allowed.`);
  }
  if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY) fail("The local Supabase status has no keys.");
  return { url: url.origin, serviceRoleKey: env.SERVICE_ROLE_KEY, anonKey: env.ANON_KEY };
}

// The engine's own mapping and schema (TypeScript), compiled on the fly into
// node_modules/.cache so zod resolves and nothing is committed.
function loadEngine() {
  const out = path.join(ROOT, "node_modules/.cache/fa-seed");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "package.json"), '{"type":"commonjs"}');
  for (const file of readdirSync(LIB)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(path.join(LIB, file), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    writeFileSync(path.join(out, file.replace(/\.ts$/, ".js")), outputText);
  }
  const require = createRequire(path.join(out, "x.js"));
  return { cellMap: require("./cell-map.js"), schema: require("./input-schema.js") };
}

const args = process.argv.slice(2);
const ownerFlag = args.indexOf("--owner");
const ownerEmail = ownerFlag >= 0 ? args[ownerFlag + 1] : null;
const name = args.find((a, i) => !a.startsWith("--") && (ownerFlag < 0 || i !== ownerFlag + 1));
const cases = readdirSync(GOLDEN).filter((f) => f.endsWith(".json") && f !== "formula-cells.json").map((f) => f.replace(/\.json$/, ""));
if (!name || !cases.includes(name)) {
  console.error(`Usage: npm run fa:seed-case <case-name> [--owner <email>]\nCases: ${cases.join(", ")}`);
  process.exit(name ? 1 : 0);
}

const { url, serviceRoleKey, anonKey } = localStack();
const { cellMap, schema } = loadEngine();
const fixture = JSON.parse(readFileSync(path.join(GOLDEN, `${name}.json`), "utf8"));
const inputs = cellMap.inputsFromCells(fixture.inputs);
if (inputs.shipment.auditReference === "") inputs.shipment.auditReference = `SEED ${name}`;
const parsed = schema.parseInputs(inputs);
if (!parsed.ok) fail(`"${name}" doesn't pass the app's input schema: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) fail(`list users: ${listError.message}`);
const isStaff = (u) => ["admin", "logistics_expert"].includes(u.app_metadata?.role);
const owner = ownerEmail ? list.users.find((u) => u.email === ownerEmail) : list.users.find(isStaff);
if (!owner || !isStaff(owner)) fail(ownerEmail ? `${ownerEmail} isn't a staff user on the local stack.` : "No staff user on the local stack.");

const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: owner.email });
if (linkError || !link?.properties?.hashed_token) fail(`sign-in link: ${linkError?.message ?? "none returned"}`);
const asOwner = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: otpError } = await asOwner.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpError) fail(`sign in as ${owner.email}: ${otpError.message}`);

const { data, error } = await asOwner.from("forwarder_audits").insert({ inputs: parsed.inputs }).select("id").single();
if (error) fail(`insert: ${error.message}`);
console.log(`Inserted "${name}" for ${owner.email}: http://localhost:3000/forwarder-audit/${data.id}`);
console.log(`Summary: http://localhost:3000/forwarder-audit/${data.id}/summary   (run the app with FORWARDER_AUDIT_ENABLED=true npm run dev)`);
