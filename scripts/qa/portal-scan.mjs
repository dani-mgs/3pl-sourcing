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
//
// Market Report (Phase 2c), for every user:
//   - no anonymised partner's name, HQ (or its city), website or email domain
//     or contact person anywhere, for the paid client too (a city that is
//     on the client's own route, like "Los Angeles", is allowed);
//   - never REPORT-CANARY (Ridgeway's report, free plan) or
//     OLD-REPORT-CANARY (an older Brightline report: clients only get the
//     latest);
//   - free plan: no report figure at all in HTML or RSC (no letters, no
//     report prices, no report headings), and the locked page shows;
//   - paid plan: the report really shows (its median and its last letter),
//     and another client's report key is a 404.
//
// Client requests (Phase 3a), for every user:
//   - no other client's request text or Move's reply to them, anywhere;
//   - never a withdrawn reply's text (WITHDRAWN-CANARY), not even the
//     client's own;
//   - the staff and write functions refuse it (another client's request id
//     or project key), and its own newest request really shows.
//
// Introductions and Market Report interest (Phase 3b), for every user:
//   - free plan: no partner letter ("Partner D") anywhere: HTML, RSC and
//     every API answer;
//   - nobody, the paid client included, ever gets the forwarder behind any
//     introduction request (its full name, any case);
//   - asking for an introduction on another client's project, or on its own
//     while on the free plan, is refused; the paid plan can't send Unlock;
//   - not vacuous: Brightline's report shows "Introduction requested",
//     Ridgeway's locked page what it asked, Northwind's the Unlock button.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const REPORT_HEADINGS = /Middle of the market|What happened to all|Every forwarder we evaluated|Like-for-like only|Partner [D-Z]{1,2}\b/;
const PARTNER_LETTER = /\bPartner [A-Z]{1,2}\b/;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// The same opaque key the database gives a client's project.
function engagementKey(clientId, projectId) {
  return createHash("md5").update(`client-update:${clientId}:${projectId}`).digest("hex");
}

function host(value) {
  if (!value) return null;
  const raw = value.includes("@") ? value.split("@").pop() : value;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

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

  // Market Reports: every anonymised partner's identifying details, and
  // every figure a report holds (for the free-plan check).
  const reports = check(await db.from("client_market_reports").select("id, client_id, forwarder_project_id, payload"), "market reports");
  const labelled = new Set(check(await db.from("market_report_partner_labels").select("forwarder_id"), "labels").map((l) => l.forwarder_id));
  const namedAnywhere = named + JSON.stringify(reports.map((r) => r.payload));
  const full = check(
    await db.from("forwarders").select("id, company_name, website, headquarters, email, contact_person, forwarder_project_id"),
    "forwarder details",
  );
  const anonymised = full.filter((f) => labelled.has(f.id) || !namedAnywhere.includes(f.company_name));
  // Distinctive words of lettered partners' names ("Meridian"), matched as
  // whole, capitalised words; generic words and words a named partner also
  // uses ("Pacific" in Pacific Bridge) don't count.
  const GENERIC = /^(Logistics|Freight|Shipping|Cargo|Lines|Line|Express|Forwarding|Global|International|Services|Ocean|Transport|Agents|Group|Trading|Supply|Solutions)$/;
  const namedNames = full.filter((f) => !anonymised.includes(f)).map((f) => f.company_name).join(" ");
  const identifying = anonymised.flatMap((f) => {
    const city = f.headquarters?.split(",")[0].trim() ?? null;
    const site = host(f.website);
    const mail = host(f.email);
    return [
      { term: f.company_name, kind: "name", of: f.company_name },
      { term: f.headquarters, kind: "HQ", of: f.company_name },
      { term: city, kind: "HQ city", of: f.company_name, city: true },
      { term: site, kind: "website", of: f.company_name },
      { term: site?.split(".").slice(0, -1).join("."), kind: "website name", of: f.company_name },
      { term: mail, kind: "email domain", of: f.company_name },
      { term: mail?.split(".").slice(0, -1).join("."), kind: "email domain name", of: f.company_name },
      { term: f.contact_person, kind: "contact", of: f.company_name },
      // Only for forwarders shown as a letter (the full name above covers
      // every forwarder never named).
      ...(labelled.has(f.id) ? f.company_name.split(/[^A-Za-z]+/) : [])
        .filter((w) => w.length >= 5 && !GENERIC.test(w) && !namedNames.includes(w))
        .map((w) => ({ term: w, kind: "name word", of: f.company_name, word: true })),
    ].filter((t) => t.term && t.term.length >= 4);
  });
  const reportPrices = [
    ...new Set(reports.flatMap((r) => (r.payload?.partners ?? []).map((p) => p.priceUsd).filter((x) => typeof x === "number"))),
  ].map((x) => usd.format(x));
  for (const r of reports) ids.add(r.id);
  const routeCities = check(await db.from("forwarder_projects").select("client_id, origin_city, destination_city"), "routes");

  // Client requests: each one's texts belong to its own client only, and a
  // withdrawn reply belongs to nobody.
  const requests = check(
    await db.from("client_requests").select("id, client_id, kind, partner_label, forwarder_project_id, message, staff_reply, reply_history, created_at"),
    "requests",
  );
  for (const r of requests) ids.add(r.id);
  const requestTexts = requests.flatMap((r) =>
    [r.message, r.staff_reply].filter((t) => typeof t === "string" && t.length >= 12).map((text) => ({ text, client: r.client_id })),
  );
  const withdrawnTexts = requests.flatMap((r) => (r.reply_history ?? []).map((h) => h.reply).filter(Boolean));

  // Introductions: the forwarder behind each requested letter (staff-only
  // labels table). No client may ever receive these names.
  const labelRows = check(await db.from("market_report_partner_labels").select("forwarder_project_id, forwarder_id, label"), "label rows");
  const nameById = new Map(full.map((f) => [f.id, f.company_name]));
  const introNames = [
    ...new Set(
      requests
        .filter((r) => r.kind === "introduction")
        .map((r) => labelRows.find((l) => l.forwarder_project_id === r.forwarder_project_id && l.label === r.partner_label))
        .map((l) => (l?.forwarder_id ? nameById.get(l.forwarder_id) : null))
        .filter(Boolean),
    ),
  ];
  return {
    clients, neverNamed, ids, projects, entitled, reports, identifying, reportPrices, routeCities, requests, requestTexts, withdrawnTexts,
    introNames, labelRows,
  };
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
  const {
    clients, neverNamed, ids, projects, entitled, reports, identifying, reportPrices, routeCities, requests, requestTexts, withdrawnTexts,
    introNames, labelRows,
  } = await forbiddenTerms(admin);
  if (!introNames.length || !requests.some((r) => r.kind === "report_interest")) {
    fail("no seeded introduction or Market Report interest; run npm run demo:seed");
  }
  if (!withdrawnTexts.some((t) => t.includes("WITHDRAWN-CANARY"))) fail("no seeded client requests; run npm run demo:seed");
  if (!reports.some((r) => JSON.stringify(r.payload).includes("REPORT-CANARY"))) fail("no seeded Market Report; run npm run demo:seed");
  const openapi = await (await fetch(`${stack.url}/rest/v1/`, { headers: { apikey: stack.serviceRoleKey, Authorization: `Bearer ${stack.serviceRoleKey}` } })).json();
  const relations = Object.keys(openapi.definitions ?? {}).sort();
  // Only functions that read: calling one that writes (complete_password_change,
  // create_*_with_client, save_duty_estimate, ...) would change the data under
  // test. The writers are refused to clients by pgTAP 28 and 30.
  const READS = /^(my_|portal_|is_|has_|search_|market_report|client_has_|client_requests_)/;
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
    // Another client's project key on the report page: 404 on the paid
    // plan; the free plan's static page never reads it.
    const otherForwarder = projects.find((p) => p.client_id !== own.id && reports.some((r) => r.forwarder_project_id === p.id));
    if (!user.mustChangePassword && otherForwarder) {
      const path = `/portal/market-report?p=${engagementKey(otherForwarder.client_id, otherForwarder.id)}`;
      const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
      bodies.push([path, await res.text()]);
      const expected = user.plan === "paid" ? 404 : 200;
      if (res.status !== expected) note(path, `expected ${expected}, got ${res.status}`);
    }

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
    let reportCount = "n/a";
    for (const fn of functions) {
      const argsFor = {
        portal_updates_for_client: others.map((c) => ({ p_client_id: c.id })).concat([{ p_client_id: own.id }]),
        portal_updates_rows: others.map((c) => ({ p_client_id: c.id })),
        market_reports_for_client: others.map((c) => ({ p_client_id: c.id })).concat([{ p_client_id: own.id }]),
        market_report_rows: others.map((c) => ({ p_client_id: c.id })),
        client_has_paid_tier: others.map((c) => ({ p_client_id: c.id })).concat([{ p_client_id: own.id }]),
        market_report_label_at: [{ p_index: 0 }],
        market_report_payload_ok: [{ p_payload: {} }],
        client_requests_for_client: others.map((c) => ({ p_client_id: c.id })).concat([{ p_client_id: own.id }]),
        client_requests_rows: others.map((c) => ({ p_client_id: c.id, p_viewer: null })),
      }[fn] ?? [{}];
      for (const args of argsFor) {
        const res = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
        const body = await res.text();
        bodies.push([`rpc ${fn} ${JSON.stringify(args)}`, body]);
        rpcCalls.push(`${fn}:${res.status}`);
        if ((fn === "portal_updates_for_client") && body !== "[]") note(`rpc ${fn}`, `returned rows for ${JSON.stringify(args)}`);
        if (fn === "portal_updates_rows" && res.ok) note(`rpc ${fn}`, "a client could call the internal query");
        if (fn === "market_reports_for_client" && body !== "[]") note(`rpc ${fn}`, `returned rows for ${JSON.stringify(args)}`);
        if (fn === "market_report_rows" && res.ok) note(`rpc ${fn}`, "a client could call the internal report query");
        if (fn === "client_requests_for_client" && body !== "[]") note(`rpc ${fn}`, `returned rows for ${JSON.stringify(args)}`);
        if (fn === "client_requests_rows" && res.ok) note(`rpc ${fn}`, "a client could call the internal requests query");
        if (fn === "client_has_paid_tier") {
          const expectedTier = args.p_client_id === own.id && user.plan === "paid" ? "true" : "false";
          if (body !== expectedTier) note(`rpc ${fn}`, `${JSON.stringify(args)} returned ${body} (expected ${expectedTier})`);
        }
        if (fn === "my_market_reports") {
          const rows = res.ok ? JSON.parse(body) : [];
          reportCount = rows.length;
          if (user.plan !== "paid" && rows.length) note(`rpc ${fn}`, `a free client got ${rows.length} report(s)`);
          if (user.plan === "paid" && rows.length !== 1) note(`rpc ${fn}`, `expected exactly the latest report, got ${rows.length}`);
        }
      }
    }
    // The staff and write functions refuse a client acting on another
    // client's request or project (none of these may succeed).
    const otherRequest = requests.find((r) => r.client_id !== own.id);
    const otherProjectKey = engagementKey(otherProject.client_id, otherProject.id);
    const refused = [
      ["mark_client_request_seen", { p_request_id: otherRequest.id }],
      ["reply_to_client_request", { p_request_id: otherRequest.id, p_reply: "scan" }],
      ["withdraw_client_request_reply", { p_request_id: otherRequest.id }],
      ["submit_client_request", { p_kind: "question", p_engagement_key: otherProjectKey, p_update_key: null, p_message: "scan", p_wants_call: false }],
      // Phase 3b: another client's project, whatever the plan.
      ...labelRows
        .filter((l) => projects.some((p) => p.id === l.forwarder_project_id && p.client_id !== own.id))
        .slice(0, 2)
        .map((l) => {
          const p = projects.find((x) => x.id === l.forwarder_project_id);
          return ["submit_client_introduction", { p_engagement_key: engagementKey(p.client_id, p.id), p_label: l.label, p_message: null, p_wants_call: false }];
        }),
      // Its own project's letters, while on the free plan.
      ...(user.plan === "free"
        ? labelRows
            .filter((l) => projects.some((p) => p.id === l.forwarder_project_id && p.client_id === own.id))
            .slice(0, 2)
            .map((l) => ["submit_client_introduction", { p_engagement_key: engagementKey(own.id, l.forwarder_project_id), p_label: l.label, p_message: null, p_wants_call: false }])
        : []),
      // Unlock, while already on the paid plan (a free client's call would write).
      ...(user.plan === "paid" ? [["submit_market_report_interest", { p_message: "scan", p_wants_call: false }]] : []),
    ];
    for (const [fn, args] of refused) {
      const res = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
      const body = await res.text();
      bodies.push([`rpc ${fn} (refused)`, body]);
      rpcCalls.push(`${fn}:${res.status}`);
      if (res.ok) note(`rpc ${fn}`, `a client wasn't refused: ${res.status} ${body.slice(0, 80)}`);
    }
    const myRequests = await (await rest("rpc/my_client_requests", { method: "POST", body: "{}" })).json();

    const mine = await (await rest("rpc/my_portal_updates", { method: "POST", body: "{}" })).json();
    // Not vacuous: the scanned portal really is this user's, signed in.
    const portalHtml = bodies.find(([w]) => w === "/portal")?.[1] ?? "";
    const newest = Array.isArray(mine) ? mine[0]?.headline : null;
    const escaped = (t) => t.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
    if (!user.mustChangePassword && (!newest || !portalHtml.includes(escaped(newest)))) {
      note("/portal", `doesn't show the newest update ("${newest}"): the scan may not be signed in`);
    }

    // Not vacuous for requests either: its own newest request shows.
    const newestRequest = Array.isArray(myRequests) ? myRequests[0]?.message : null;
    if (!user.mustChangePassword && newestRequest && !portalHtml.includes(escaped(newestRequest))) {
      note("/portal", `doesn't show its newest request ("${newestRequest}")`);
    }

    // Not vacuous for the report either: paid sees it, free sees the lock.
    const reportHtml = bodies.find(([w]) => w === "/portal/market-report")?.[1] ?? "";
    if (!user.mustChangePassword && user.plan === "paid" && !(reportHtml.includes("$9,610") && reportHtml.includes("Partner L"))) {
      note("/portal/market-report", "doesn't show the paid report (median $9,610, Partner L)");
    }
    if (!user.mustChangePassword && user.plan === "free" && !reportHtml.includes("Locked · paid plan")) {
      note("/portal/market-report", "doesn't show the locked page");
    }
    // Phase 3b, not vacuous: what was asked shows, or the button does.
    const askedIntro = requests.some((r) => r.client_id === own.id && r.kind === "introduction");
    const askedUnlock = requests.some((r) => r.client_id === own.id && r.kind === "report_interest");
    if (!user.mustChangePassword && user.plan === "paid" && askedIntro && !reportHtml.includes("Introduction requested")) {
      note("/portal/market-report", "doesn't show its introduction request");
    }
    if (!user.mustChangePassword && user.plan === "free") {
      const expected = askedUnlock ? "You asked about the Market Report" : "Unlock the Market Report";
      if (!reportHtml.includes(expected)) note("/portal/market-report", `doesn't show "${expected}"`);
    }

    // ---- The scan ------------------------------------------------------------------------
    const ownCities = new Set(
      routeCities.filter((r) => r.client_id === own.id).flatMap((r) => [r.origin_city, r.destination_city]).filter(Boolean),
    );
    for (const [where, body] of bodies) {
      if (body.includes("INTERNAL-CANARY")) note(where, "INTERNAL-CANARY");
      if (body.includes("DRAFT-CANARY")) note(where, "DRAFT-CANARY (a draft)");
      const status = body.match(STATUS_WORDS);
      if (status && !where.startsWith("rpc search_hts")) note(where, `status word "${status[0]}"`);
      for (const c of others) if (body.includes(c.name)) note(where, `other client's name "${c.name}"`);
      for (const n of neverNamed) if (body.includes(n)) note(where, `unshortlisted partner "${n}"`);
      for (const t of requestTexts) {
        if (t.client !== own.id && body.includes(t.text)) note(where, `another client's request or reply ("${t.text.slice(0, 40)}")`);
      }
      for (const t of withdrawnTexts) if (body.includes(t) || body.includes("WITHDRAWN-CANARY")) note(where, "a withdrawn reply");
      if (body.includes("REPORT-CANARY")) note(where, body.includes("OLD-REPORT-CANARY") ? "OLD-REPORT-CANARY (an older report)" : "REPORT-CANARY (a free client's report)");
      const lower = body.toLowerCase();
      for (const t of identifying) {
        if (t.city && ownCities.has(t.term)) continue;
        const found = t.word ? new RegExp(`\\b${t.term}\\b`).test(body) : lower.includes(t.term.toLowerCase());
        if (found) note(where, `anonymised partner's ${t.kind} "${t.term}" (${t.of})`);
      }
      // Phase 3b: a free client never gets a partner letter, anywhere.
      if (user.plan === "free") {
        const letter = body.match(PARTNER_LETTER);
        if (letter) note(where, `a partner letter on the free plan ("${letter[0]}")`);
      }
      // Nobody ever gets the forwarder behind an introduction request.
      for (const n of introNames) if (lower.includes(n.toLowerCase())) note(where, `the partner behind an introduction request ("${n}")`);
      if (user.plan === "free" && where.startsWith("/portal")) {
        const heading = body.match(REPORT_HEADINGS);
        if (heading) note(where, `Market Report content on the free plan ("${heading[0]}")`);
        for (const price of reportPrices) if (body.includes(price)) note(where, `Market Report price ${price} on the free plan`);
        if (body.includes("priceUsd")) note(where, "Market Report data on the free plan");
      }
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
      reports: reportCount,
      requests: Array.isArray(myRequests) ? myRequests.length : "error",
      readable: readable.join(", ") || "none",
    });
  }

  console.table(report);
  if (problems.length) {
    console.error(`qa:portal-scan: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `qa:portal-scan: clean (${USERS.length} client users, ${relations.length} tables/views, ${functions.length} functions, ` +
      `${identifying.length} identifying terms of anonymised partners, ${reportPrices.length} report prices, ` +
      `${introNames.length} partner(s) behind introduction requests).`,
  );
}

await main();
