// npm run qa:portal-scan [-- http://localhost:3100]
//
// Leak scan of the client portal, LOCAL ONLY (the same guard as the seeds:
// the Supabase URL comes from `npx supabase status -o env`, never .env
// files, and only the local stack is accepted; the app URL must be
// localhost). Needs `npm run demo:seed` and a dev server running the app.
//
// For each demo client user (paid Brightline, free Ridgeway, both Northwind
// users, and Solace, who must still change their password) it signs in with
// a one-time magic-link token (no password is read or changed) and:
//   - fetches every portal page as HTML and as the RSC payload;
//   - tries staff pages and "View as client" for its own and other clients
//     (must be 404 or a redirect into the portal);
//   - reads every public table and view, and calls every function, over
//     PostgREST with its own token, including other clients' ids;
// then fails on INTERNAL-CANARY, DRAFT-CANARY, internal status words, other
// clients' names, partners never shortlisted, and any internal id.

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";
const EMAIL_DOMAIN = "demo.example.test";

const USERS = [
  { email: `brightline-ops@${EMAIL_DOMAIN}`, client: "Brightline Apparel", plan: "paid" },
  { email: `ridgeway-ops@${EMAIL_DOMAIN}`, client: "Ridgeway Outdoor", plan: "free" },
  { email: `northwind-ops@${EMAIL_DOMAIN}`, client: "Northwind Coffee Roasters", plan: "free" },
  { email: `northwind-finance@${EMAIL_DOMAIN}`, client: "Northwind Coffee Roasters", plan: "free" },
  { email: `solace-ops@${EMAIL_DOMAIN}`, client: "Solace Skincare", plan: "free", mustChangePassword: true },
];

const STATUS_WORDS =
  /Unfit|Do Not Contact|Do not Contact|Withdrawn|No Response|Vetted|Under Assessment|Move Recommended|Reviewing Quotation|Waiting for Quotation|Potential \/ Not Contacted/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function fail(message) {
  console.error(`qa:portal-scan: ${message}`);
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
  const url = new URL(env.API_URL ?? "http://invalid");
  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== LOCAL_PORT) {
    fail(`Refusing ${url.origin}: only the local stack (http://127.0.0.1:${LOCAL_PORT}) is allowed.`);
  }
  if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY) fail("The local Supabase status has no keys.");
  return { url: url.origin, serviceRoleKey: env.SERVICE_ROLE_KEY, anonKey: env.ANON_KEY };
}

function appBase() {
  const base = new URL(process.argv[2] ?? "http://localhost:3100");
  if (!LOCAL_HOSTS.has(base.hostname)) fail(`Refusing ${base.origin}: the app must be local.`);
  return base.origin;
}

function check({ data, error }, what) {
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

// Everything the scan must never see, from the database (service role).
async function forbiddenTerms(db) {
  const clients = check(await db.from("clients").select("id, name"), "clients");
  const updates = check(await db.from("client_updates").select("id, client_id, payload, is_draft, three_pl_project_id, forwarder_project_id"), "updates");
  const named = JSON.stringify(updates.filter((u) => !u.is_draft).map((u) => u.payload));
  const forwarders = check(await db.from("forwarders").select("id, company_name"), "forwarders");
  const providers = check(await db.from("three_pl_providers").select("id, company_name"), "providers");
  const neverNamed = [...forwarders, ...providers].map((p) => p.company_name).filter((n) => !named.includes(n));
  const ids = new Set([
    ...clients.map((c) => c.id),
    ...updates.map((u) => u.id),
    ...updates.flatMap((u) => [u.three_pl_project_id, u.forwarder_project_id]).filter(Boolean),
    ...forwarders.map((f) => f.id),
    ...providers.map((p) => p.id),
    ...check(await db.from("profiles").select("id"), "profiles").map((p) => p.id),
  ]);
  const projects = [
    ...check(await db.from("three_pl_projects").select("id, client_id"), "3PL projects"),
    ...check(await db.from("forwarder_projects").select("id, client_id"), "forwarder projects"),
  ];
  for (const p of projects) ids.add(p.id);
  const entitled = new Set(check(await db.from("client_entitlements").select("client_id"), "entitlements").map((e) => e.client_id));
  return { clients, neverNamed, ids, projects, entitled };
}

async function signIn(stack, admin, email) {
  const link = check(await admin.auth.admin.generateLink({ type: "magiclink", email }), `link for ${email}`);
  const anon = createClient(stack.url, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { session } = check(await anon.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token }), `sign in ${email}`);
  // Let @supabase/ssr write its own cookies, so the app reads them as usual.
  const jar = new Map();
  const ssr = createServerClient(stack.url, stack.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  check(await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }), "session");
  return { token: session.access_token, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

async function main() {
  const stack = localStack();
  const base = appBase();
  const admin = createClient(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { clients, neverNamed, ids, projects, entitled } = await forbiddenTerms(admin);
  const openapi = await (await fetch(`${stack.url}/rest/v1/`, { headers: { apikey: stack.serviceRoleKey, Authorization: `Bearer ${stack.serviceRoleKey}` } })).json();
  const relations = Object.keys(openapi.definitions ?? {}).sort();
  // Only functions that read: calling one that writes (complete_password_change,
  // create_*_with_client, save_duty_estimate, ...) would change the data under
  // test. The writers are refused to clients by pgTAP 28 and 30.
  const READS = /^(my_|portal_|is_|has_|search_)/;
  const functions = Object.keys(openapi.paths ?? {})
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.slice(5))
    .filter((fn) => READS.test(fn))
    .sort();
  if (relations.length < 20) fail(`only ${relations.length} tables and views found; is the schema loaded?`);

  const problems = [];
  const report = [];
  for (const user of USERS) {
    const own = clients.find((c) => c.name === user.client);
    if (!own) fail(`${user.client} isn't seeded; run npm run demo:seed`);
    const others = clients.filter((c) => c.id !== own.id);
    const { token, cookie } = await signIn(stack, admin, user.email);
    const bodies = [];
    const note = (where, problem) => problems.push(`${user.email} ${where}: ${problem}`);

    // ---- Pages -----------------------------------------------------------------------
    const pages = user.mustChangePassword ? ["/portal/change-password"] : ["/portal", "/portal/market-report", "/portal/change-password"];
    for (const path of pages) {
      for (const rsc of [false, true]) {
        // An RSC request is first redirected to add Next's `_rsc` cache key;
        // follow it (same origin, so the cookie goes along).
        const res = await fetch(base + path, { headers: { cookie, ...(rsc ? { RSC: "1" } : {}) }, redirect: rsc ? "follow" : "manual" });
        const body = await res.text();
        if (res.status !== 200) note(`${path}${rsc ? " (RSC)" : ""}`, `status ${res.status}`);
        if (rsc && !(res.headers.get("content-type") ?? "").includes("text/x-component")) note(`${path} (RSC)`, "not an RSC payload");
        bodies.push([`${path}${rsc ? " (RSC)" : ""}`, body]);
      }
    }
    if (user.mustChangePassword) {
      for (const path of ["/portal", "/portal/market-report"]) {
        const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
        const to = res.headers.get("location") ?? "";
        if (!(res.status >= 300 && res.status < 400 && to.endsWith("/portal/change-password"))) {
          note(path, `expected a redirect to the change-password page, got ${res.status} ${to}`);
        }
      }
    }

    // ---- Staff pages and guessed ids: 404 (or "/" sending them into the portal) --------
    const otherProject = projects.find((p) => p.client_id !== own.id);
    const ownProject = projects.find((p) => p.client_id === own.id);
    const guesses = [
      "/forwarder-sourcing",
      "/3pl-sourcing",
      "/client-access",
      "/admin",
      "/help",
      `/client-access/${own.id}/preview`,
      `/client-access/${others[0].id}/preview`,
      `/client-access/${others[0].id}/preview/market-report`,
      `/forwarder-sourcing/${otherProject.id}/share`,
      `/3pl-sourcing/projects/${ownProject.id}/share`,
      `/portal/${otherProject.id}`,
      `/portal/market-report/${otherProject.id}`,
    ];
    for (const path of guesses) {
      const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
      // A 404 page echoes the requested path (Next's router data lists its
      // segments); ids the scan itself put in the URL don't count as leaks.
      let body = await res.text();
      for (const id of path.match(UUID) ?? []) body = body.replaceAll(id, "<requested id>");
      bodies.push([path, body]);
      const location = res.headers.get("location") ?? "";
      // Until they've chosen a password, portal paths send them to do that.
      const ok = user.mustChangePassword && path.startsWith("/portal")
        ? res.status >= 300 && res.status < 400 && location.endsWith("/portal/change-password")
        : res.status === 404;
      if (!ok) note(path, `expected ${user.mustChangePassword && path.startsWith("/portal") ? "a redirect to change-password" : "404"}, got ${res.status} ${location}`);
    }

    // ---- PostgREST with the client's own token ----------------------------------------
    const rest = (path, init = {}) =>
      fetch(`${stack.url}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: stack.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
    const readable = [];
    for (const rel of relations) {
      const res = await rest(`${rel}?select=*`);
      const body = await res.text();
      bodies.push([`GET ${rel}`, body]);
      if (res.ok && body !== "[]") readable.push(rel);
    }
    // A client reads exactly one table, its own plan row, and only if it has one.
    const expected = entitled.has(own.id) ? "client_entitlements" : "";
    if (readable.join() !== expected) note("tables", `readable: ${readable.join(", ") || "none"} (expected ${expected || "none"})`);
    const rpcCalls = [];
    for (const fn of functions) {
      const argsFor = {
        portal_updates_for_client: others.map((c) => ({ p_client_id: c.id })).concat([{ p_client_id: own.id }]),
        portal_updates_rows: others.map((c) => ({ p_client_id: c.id })),
      }[fn] ?? [{}];
      for (const args of argsFor) {
        const res = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
        const body = await res.text();
        bodies.push([`rpc ${fn} ${JSON.stringify(args)}`, body]);
        rpcCalls.push(`${fn}:${res.status}`);
        if ((fn === "portal_updates_for_client") && body !== "[]") note(`rpc ${fn}`, `returned rows for ${JSON.stringify(args)}`);
        if (fn === "portal_updates_rows" && res.ok) note(`rpc ${fn}`, "a client could call the internal query");
      }
    }
    const mine = await (await rest("rpc/my_portal_updates", { method: "POST", body: "{}" })).json();
    // Not vacuous: the scanned portal really is this user's, signed in.
    const portalHtml = bodies.find(([w]) => w === "/portal")?.[1] ?? "";
    const newest = Array.isArray(mine) ? mine[0]?.headline : null;
    const escaped = (t) => t.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
    if (!user.mustChangePassword && (!newest || !portalHtml.includes(escaped(newest)))) {
      note("/portal", `doesn't show the newest update ("${newest}"): the scan may not be signed in`);
    }

    // ---- The scan ------------------------------------------------------------------------
    for (const [where, body] of bodies) {
      if (body.includes("INTERNAL-CANARY")) note(where, "INTERNAL-CANARY");
      if (body.includes("DRAFT-CANARY")) note(where, "DRAFT-CANARY (a draft)");
      const status = body.match(STATUS_WORDS);
      if (status && !where.startsWith("rpc search_hts")) note(where, `status word "${status[0]}"`);
      for (const c of others) if (body.includes(c.name)) note(where, `other client's name "${c.name}"`);
      for (const n of neverNamed) if (body.includes(n)) note(where, `unshortlisted partner "${n}"`);
      // The client's own client id is in its own token (app_metadata) and plan
      // row; any other internal id is a leak.
      for (const id of body.match(UUID) ?? []) {
        const lower = id.toLowerCase();
        if (lower === own.id || (where === "GET client_entitlements" && !ids.has(lower))) continue;
        if (ids.has(lower)) note(where, `internal id ${id}`);
      }
    }
    report.push({
      user: user.email,
      plan: user.plan,
      pages: bodies.filter(([w]) => w.startsWith("/portal")).length,
      guesses: guesses.length,
      tables: relations.length,
      functions: rpcCalls.length,
      ownUpdates: Array.isArray(mine) ? mine.length : `error ${JSON.stringify(mine).slice(0, 60)}`,
      readable: readable.join(", ") || "none",
    });
  }

  console.table(report);
  if (problems.length) {
    console.error(`qa:portal-scan: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`qa:portal-scan: clean (${USERS.length} client users, ${relations.length} tables/views, ${functions.length} functions).`);
}

await main();
