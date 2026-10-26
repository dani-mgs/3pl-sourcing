// Runs the app and the npm scripts for a regression from the QA worktree,
// LOCAL ONLY. One command per action, so an unattended run needs no keys on
// the command line, no `kill` and no `nvm use` (shell state doesn't persist).
//
//   node scripts/qa/qa-run.mjs check
//   node scripts/qa/qa-run.mjs start --port 3100 --flag on   (stays in the foreground)
//   node scripts/qa/qa-run.mjs stop --port 3100
//   node scripts/qa/qa-run.mjs build --flag on
//   node scripts/qa/qa-run.mjs npm <script> [-- args]        (e.g. npm test, npm qa:seed)
//
// Everything runs in the worktree at ../3pl-sourcing-qa (created with
// `git worktree add --detach ../3pl-sourcing-qa HEAD`), under the Node version
// in .nvmrc from ~/.nvm. It refuses to run if the worktree holds any .env*
// file, or if the Supabase URL from `npx supabase status -o env` isn't the
// local API (127.0.0.1 / localhost, port 54321). Keys are read from the local
// CLI into the child's environment only, never printed or written.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKTREE = resolve(REPO, "../3pl-sourcing-qa");
const PID_DIR = join(WORKTREE, ".qa-run");

function fail(message) {
  console.error(`qa-run: ${message}`);
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function nodeBin() {
  const want = readFileSync(join(REPO, ".nvmrc"), "utf8").trim().replace(/^v/, "");
  const root = join(homedir(), ".nvm/versions/node");
  const match = readdirSync(root)
    .filter((v) => v === `v${want}` || v.startsWith(`v${want}.`))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!match) fail(`Node ${want} (.nvmrc) isn't installed under ~/.nvm.`);
  return join(root, match, "bin");
}

function checkWorktree() {
  if (!existsSync(join(WORKTREE, ".git"))) fail(`No worktree at ${WORKTREE}. Create it first.`);
  if (!existsSync(join(WORKTREE, "node_modules"))) fail("The worktree has no node_modules. Clone them first.");
  const envFiles = readdirSync(WORKTREE).filter((f) => f.startsWith(".env") && f !== ".env.example");
  if (envFiles.length > 0) fail(`Refusing: the worktree holds ${envFiles.join(", ")}. Remove it; the run never loads .env files.`);
}

function localSupabase() {
  let out;
  try {
    out = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
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
  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) fail("The local Supabase status has no ANON_KEY or SERVICE_ROLE_KEY.");
  return { url: url.origin, anonKey: env.ANON_KEY, serviceRoleKey: env.SERVICE_ROLE_KEY };
}

// The parent's environment minus anything that could point the app elsewhere.
function baseEnv() {
  const env = { ...process.env, PATH: `${nodeBin()}:${process.env.PATH}` };
  for (const key of Object.keys(env)) {
    if (/SUPABASE|ANTHROPIC|CRON_SECRET|LANDED_COST|^NEXT_PUBLIC_/.test(key)) delete env[key];
  }
  return env;
}

function appEnv(flag) {
  if (flag !== "on" && flag !== "off") fail("--flag must be on or off.");
  const db = localSupabase();
  return {
    ...baseEnv(),
    NEXT_PUBLIC_SUPABASE_URL: db.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: db.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: db.serviceRoleKey,
    CRON_SECRET: `qa-local-${randomBytes(12).toString("hex")}`,
    LANDED_COST_ENABLED: flag === "on" ? "true" : "false",
  };
}

function run(command, args, env) {
  const child = spawn(command, args, { cwd: WORKTREE, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  return child;
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "check": {
    checkWorktree();
    const db = localSupabase();
    const node = execFileSync(join(nodeBin(), "node"), ["-v"], { encoding: "utf8" }).trim();
    console.log(`worktree ${WORKTREE}\nnode ${node}\nsupabase ${db.url}\nno .env files: ok`);
    break;
  }
  case "start": {
    checkWorktree();
    const port = arg("port", "3100");
    const env = appEnv(arg("flag", "on"));
    mkdirSync(PID_DIR, { recursive: true });
    const child = run(join(WORKTREE, "node_modules/.bin/next"), ["dev", "-p", port], env);
    writeFileSync(join(PID_DIR, `${port}.pid`), `${process.pid}\n`);
    console.log(`qa-run: next dev on :${port}, LANDED_COST_ENABLED=${env.LANDED_COST_ENABLED}, Supabase ${env.NEXT_PUBLIC_SUPABASE_URL}`);
    child.on("exit", (code) => {
      rmSync(join(PID_DIR, `${port}.pid`), { force: true });
      process.exit(code ?? 0);
    });
    break;
  }
  case "stop": {
    const port = arg("port", "3100");
    const file = join(PID_DIR, `${port}.pid`);
    if (!existsSync(file)) fail(`No app started by qa-run on :${port}.`);
    const pid = Number(readFileSync(file, "utf8"));
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    rmSync(file, { force: true });
    console.log(`qa-run: stopped :${port}`);
    break;
  }
  case "build": {
    checkWorktree();
    run(join(WORKTREE, "node_modules/.bin/next"), ["build"], appEnv(arg("flag", "on"))).on("exit", (code) =>
      process.exit(code ?? 1),
    );
    break;
  }
  case "npm": {
    checkWorktree();
    const [script, ...args] = rest;
    if (!script) fail("Name an npm script.");
    if (/^(dev|build|start|tariff:|demo:remove)/.test(script)) fail(`Refusing npm run ${script} (denied for the run).`);
    run(join(nodeBin(), "npm"), ["run", script, ...args], baseEnv()).on("exit", (code) => process.exit(code ?? 1));
    break;
  }
  default:
    fail("Usage: check | start --port N --flag on|off | stop --port N | build --flag on|off | npm <script> [-- args]");
}
