// QA seed for the LOCAL Supabase stack only. Run: npm run qa:seed
//
// Creates five test users (one per role, plus a throwaway target for the
// admin tests) and ZZQA-prefixed 3PL, Forwarder and Tariff test data. Every
// run deletes the previous ZZQA data first, then inserts it again, and gives
// the test users a new random password, which is printed once and never
// written to disk.
//
// The URL and service-role key come from `npx supabase status -o env` (the
// local CLI), never from .env files, and the script refuses to run unless the
// URL is the local API (127.0.0.1 / localhost, port 54321).
//
// Reference data it adds when missing: an HTS release "ZZQA-local" with a
// handful of real HTS codes (USITC isn't reachable locally) and fx_rates for
// today and yesterday (the daily feed is external). It never overwrites a
// non-ZZQA HTS release or existing fx_rates rows.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "ZZQA";
const EMAIL_DOMAIN = "example.test";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";

function localStack() {
  let out;
  try {
    out = execFileSync("npx", ["supabase", "status", "-o", "env"], {
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
    fail(`Refusing to seed ${url.origin}: only the local stack (http://127.0.0.1:${LOCAL_PORT}) is allowed.`);
  }
  if (!env.SERVICE_ROLE_KEY) fail("The local Supabase status has no SERVICE_ROLE_KEY.");
  return { url: url.origin, serviceRoleKey: env.SERVICE_ROLE_KEY };
}

function fail(message) {
  console.error(`qa:seed: ${message}`);
  process.exit(1);
}

function check({ data, error }, what) {
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// 20 characters from a URL-safe alphabet plus a fixed suffix, so it always
// meets letter/digit/symbol rules.
function randomPassword() {
  return `${randomBytes(15).toString("base64url")}-Qa9`;
}

const USERS = [
  { key: "admin", email: `zzqa-admin@${EMAIL_DOMAIN}`, firstName: "ZZQA Admin", role: "admin", tariffEditor: false },
  { key: "editor", email: `zzqa-editor@${EMAIL_DOMAIN}`, firstName: "ZZQA Editor", role: "logistics_expert", tariffEditor: true },
  { key: "expert1", email: `zzqa-expert1@${EMAIL_DOMAIN}`, firstName: "ZZQA Expert One", role: "logistics_expert", tariffEditor: false },
  { key: "expert2", email: `zzqa-expert2@${EMAIL_DOMAIN}`, firstName: "ZZQA Expert Two", role: "logistics_expert", tariffEditor: false },
  { key: "target", email: `zzqa-target@${EMAIL_DOMAIN}`, firstName: "ZZQA Target", role: "logistics_expert", tariffEditor: false },
];

async function allUsers(db) {
  const users = [];
  for (let page = 1; ; page++) {
    const data = check(await db.auth.admin.listUsers({ page, perPage: 1000 }), "list users");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

// Creates each user, or resets an existing one to its seeded name, role and
// a new password (the admin tests rename and promote zzqa-target).
async function upsertUsers(db, password) {
  const existing = new Map((await allUsers(db)).map((u) => [u.email, u]));
  const ids = {};
  for (const u of USERS) {
    const attrs = {
      password,
      email_confirm: true,
      // Names are in app_metadata (admin-only), like the role.
      app_metadata: { role: u.role, tariff_editor: u.tariffEditor ? true : null, first_name: u.firstName },
    };
    const found = existing.get(u.email);
    const data = found
      ? check(await db.auth.admin.updateUserById(found.id, attrs), `update ${u.email}`)
      : check(await db.auth.admin.createUser({ email: u.email, ...attrs }), `create ${u.email}`);
    ids[u.key] = data.user.id;
  }
  return ids;
}

async function idsWhere(query, what) {
  return (check(await query, what) ?? []).map((r) => r.id);
}

// Deletes children before parents (several FKs are RESTRICT or have no
// ON DELETE). Covers ZZQA clients and anything the test users created,
// including UI-created projects whose client wasn't ZZQA-prefixed.
async function resetData(db, userIds) {
  const owners = Object.values(userIds);
  const clientIds = await idsWhere(db.from("clients").select("id").like("name", `${PREFIX}%`), "find clients");

  const fpIds = new Set([
    ...(await idsWhere(db.from("forwarder_projects").select("id").in("owner_id", owners), "find forwarder projects")),
    ...(await idsWhere(db.from("forwarder_projects").select("id").in("client_id", clientIds), "find forwarder projects")),
  ]);
  const tpIds = new Set([
    ...(await idsWhere(db.from("three_pl_projects").select("id").in("owner_id", owners), "find 3PL projects")),
    ...(await idsWhere(db.from("three_pl_projects").select("id").in("client_id", clientIds), "find 3PL projects")),
  ]);

  check(await db.from("duty_estimates").delete().in("created_by", owners), "delete estimates");
  if (fpIds.size) {
    const ids = [...fpIds];
    check(await db.from("duty_estimates").delete().in("forwarder_project_id", ids), "delete linked estimates");
    // forwarder_quotes cascade from forwarders.
    check(await db.from("forwarders").delete().in("forwarder_project_id", ids), "delete forwarders");
    check(await db.from("forwarder_projects").delete().in("id", ids), "delete forwarder projects");
  }
  if (tpIds.size) {
    const ids = [...tpIds];
    // rate_details cascade from providers; recommendation from projects.
    check(await db.from("three_pl_providers").delete().in("three_pl_project_id", ids), "delete 3PLs");
    check(await db.from("three_pl_projects").delete().in("id", ids), "delete 3PL projects");
  }
  if (clientIds.length) check(await db.from("clients").delete().in("id", clientIds), "delete clients");
}

async function insertOne(db, table, row) {
  return check(await db.from(table).insert(row).select("id").single(), `insert ${table}`).id;
}

async function insertMany(db, table, rows) {
  if (rows.length) check(await db.from(table).insert(rows), `insert ${table}`);
}

const LONG_NAME = `${PREFIX} Very Long Client Name ${"Logistics Holdings International ".repeat(6).trim()}`;
const LONG_TEXT = `${PREFIX} long text. ${"This sentence repeats to test wrapping and overflow in narrow layouts. ".repeat(30).trim()}`;

async function seedClients(db) {
  const clients = {
    existing: { name: `${PREFIX} Existing Client Co`, business_model: "B2C" },
    special: { name: `${PREFIX} Café & Crème Ünïcödé 🚚 Ltd`, business_model: "B2B & B2C" },
    long: { name: LONG_NAME, business_model: "B2B" },
    expert2: { name: `${PREFIX} Expert Two Client`, business_model: "B2C" },
    pakkable: { name: `${PREFIX} Pakkable-style Co`, business_model: "B2C" },
    eur: { name: `${PREFIX} EUR Invoice GmbH`, business_model: "B2B" },
    vnd: { name: `${PREFIX} VND Invoice JSC`, business_model: "B2B" },
    nocurrency: { name: `${PREFIX} No Currency Invoice Inc`, business_model: "B2B" },
    noinvoice: { name: `${PREFIX} No Invoice Inc`, business_model: "B2B" },
    noquotes: { name: `${PREFIX} No Quotes Inc`, business_model: "B2B" },
    diffterms: { name: `${PREFIX} Different Terms Inc`, business_model: "B2B" },
    air: { name: `${PREFIX} High Volume Air Inc`, business_model: "B2C" },
    tie: { name: `${PREFIX} Rounding Tie Inc`, business_model: "B2C" },
  };
  const ids = {};
  for (const [key, row] of Object.entries(clients)) ids[key] = await insertOne(db, "clients", row);
  return ids;
}

const NO_COSTS = {
  storage_cost: null, pick_pack_cost: null, receiving_cost: null, returns_cost: null,
  system_setup_cost: null, inventory_on_request_cost: null, adhoc_bundling_kitting_cost: null,
  adhoc_labelling_cost: null, b2b_pick_pack_cost: null,
};

function provider(projectId, name, extra = {}) {
  return {
    three_pl_project_id: projectId,
    company_name: `${PREFIX} ${name}`,
    location: "Los Angeles, CA",
    status: "Potential / Not Contacted",
    currency: "USD",
    is_incumbent: false,
    receiving: true, storage: true, fulfillment: true, dispatch: true,
    ...NO_COSTS,
    ...extra,
  };
}

function threePlProject(ownerId, clientId, extra = {}) {
  return {
    owner_id: ownerId,
    client_id: clientId,
    status: "Active",
    target_geography: "US West Coast",
    benchmark_period: "Last 12 months",
    avg_monthly_orders: 4000,
    peak_monthly_orders: 9000,
    avg_monthly_units: 12000,
    main_decision_focus: "Cost",
    ...extra,
  };
}

async function seedThreePl(db, users, clients) {
  // Existing client, 36-month contract: incumbent baseline, two 3PLs tied on
  // total cost, one cheaper, one with no costs, one excluded by status.
  const main = await insertOne(db, "three_pl_projects",
    threePlProject(users.expert1, clients.existing, { contract_period_months: 36 }));
  await insertMany(db, "three_pl_providers", [
    provider(main, "Incumbent 3PL", { is_incumbent: true, status: "Baseline", storage_cost: 600, pick_pack_cost: 400 }),
    provider(main, "Tie Alpha 3PL", { status: "Vetted", storage_cost: 500, pick_pack_cost: 300 }),
    provider(main, "Tie Bravo 3PL", { status: "Vetted", storage_cost: 300, pick_pack_cost: 500 }),
    provider(main, "Cheapest Charlie 3PL", { status: "Shortlisted", storage_cost: 400, pick_pack_cost: 250, receiving_cost: 50 }),
    provider(main, "No Cost Delta 3PL", { status: "Contacted" }),
    provider(main, "Unfit Echo 3PL", { status: "Unfit", storage_cost: 100 }),
  ]);

  // Second project on the same client, contract period blank.
  const second = await insertOne(db, "three_pl_projects",
    threePlProject(users.expert1, clients.existing, { contract_period_months: null, target_geography: "US East Coast" }));
  await insertMany(db, "three_pl_providers", [
    provider(second, "East One 3PL", { storage_cost: 900 }),
  ]);

  // Accents/&/emoji client, 1-month contract, mixed currencies.
  const special = await insertOne(db, "three_pl_projects",
    threePlProject(users.expert1, clients.special, { contract_period_months: 1, summary_notes: `${PREFIX} Notes with accents é ü ñ, ampersand & and emoji 📦` }));
  await insertMany(db, "three_pl_providers", [
    provider(special, "Euro Lager 3PL", { currency: "EUR", storage_cost: 700 }),
    provider(special, "Dollar Depot 3PL", { currency: "USD", storage_cost: 650 }),
  ]);

  // Long names and text, 120-month contract (the maximum).
  const long = await insertOne(db, "three_pl_projects",
    threePlProject(users.expert1, clients.long, { contract_period_months: 120, assumptions_data_limitations: LONG_TEXT }));
  await insertMany(db, "three_pl_providers", [
    provider(long, `Long Name 3PL ${"Warehousing ".repeat(10).trim()}`, { notes: LONG_TEXT, storage_cost: 1000 }),
  ]);

  // Owned by expert 2: read-only for expert 1, reassignable by admin.
  const other = await insertOne(db, "three_pl_projects",
    threePlProject(users.expert2, clients.expert2, { contract_period_months: 12 }));
  await insertMany(db, "three_pl_providers", [
    provider(other, "Expert Two Incumbent 3PL", { is_incumbent: true, status: "Baseline", storage_cost: 800 }),
    provider(other, "Expert Two Vetted 3PL", { status: "Vetted", storage_cost: 700 }),
  ]);
}

function forwarderProject(ownerId, clientId, extra = {}) {
  return {
    owner_id: ownerId,
    client_id: clientId,
    status: "Active",
    origin_country: "China",
    origin_city: "Shenzhen",
    origin_port: "Yantian",
    destination_country: "United States",
    destination_city: "Los Angeles",
    destination_port: "Long Beach",
    weight_kg: 8000,
    cbm: 28,
    cartons: 400,
    cargo_description: `${PREFIX} consumer goods`,
    shipment_mode: "Sea",
    shipment_type: "FCL",
    current_incoterm: "DDP",
    final_shipment_mode: "Sea",
    final_shipment_type: "FCL",
    final_incoterm: "DDP",
    incoterms_to_compare: ["DDP"],
    invoice_value: 50000,
    invoice_currency: "USD",
    current_freight_cost_usd: 3500,
    shipments_per_month: 2,
    project_duration_months: 12,
    ...extra,
  };
}

async function forwarderWithQuotes(db, projectId, name, quotes, extra = {}) {
  const forwarderId = await insertOne(db, "forwarders", {
    forwarder_project_id: projectId,
    company_name: `${PREFIX} ${name}`,
    status: "Reviewing Quotation",
    sea_freight: true,
    air_freight: true,
    ...extra,
  });
  await insertMany(db, "forwarder_quotes", quotes.map((q) => ({
    forwarder_id: forwarderId,
    shipment_mode: "Sea",
    shipment_type: "FCL",
    incoterm: "DDP",
    original_currency: "USD",
    exchange_rate_to_usd: 1,
    chargeable_weight_kg: 8000,
    actual_weight_kg: 8000,
    quote_completeness: "Complete / Comparable",
    quote_date: isoDate(-3),
    rate_valid_until: isoDate(30),
    lead_time_min_days: 20,
    lead_time_max_days: 28,
    ...q,
  })));
}

async function seedForwarder(db, users, clients) {
  const fp = (client, extra) => insertOne(db, "forwarder_projects", forwarderProject(users.expert1, client, extra));

  // Pakkable-style: 4 DDP quotes ranked, 2 DDU quotes greyed as "Different terms".
  const pak = await fp(clients.pakkable, { project_duration_months: 24 });
  await forwarderWithQuotes(db, pak, "Ocean Alpha Forwarding", [
    { original_amount: 3200, scenario_group: "DDP option" },
    { original_amount: 2900, incoterm: "DDU (legacy term)", scenario_group: "DDU option" },
  ]);
  await forwarderWithQuotes(db, pak, "Bravo Freight Lines", [
    { original_amount: 3000 },
    { original_amount: 2700, incoterm: "DDU (legacy term)" },
  ]);
  await forwarderWithQuotes(db, pak, "Charlie Cargo EUR", [
    // EUR quote converted with a manual rate dated today.
    { original_currency: "EUR", original_amount: 3000, exchange_rate_to_usd: 1.1, exchange_rate_source: "manual", exchange_rate_date: isoDate() },
  ]);
  await forwarderWithQuotes(db, pak, "Delta Logistics", [{ original_amount: 3800 }]);

  // EUR invoice: ratio blocked ("Invoice must be in USD").
  const eur = await fp(clients.eur, { invoice_value: 40000, invoice_currency: "EUR", current_freight_cost_usd: 2000, origin_country: "Germany", origin_city: "Hamburg", origin_port: "Hamburg" });
  await forwarderWithQuotes(db, eur, "Euro Ocean", [{ original_amount: 1900 }, { original_amount: 2100 }]);

  // VND invoice.
  const vnd = await fp(clients.vnd, { invoice_value: 1250000000, invoice_currency: "VND", current_freight_cost_usd: 2500, origin_country: "Vietnam", origin_city: "Ho Chi Minh City", origin_port: "Cat Lai" });
  await forwarderWithQuotes(db, vnd, "Saigon Sea", [{ original_amount: 2300 }]);

  // Invoice value with no currency.
  const noCur = await fp(clients.nocurrency, { invoice_value: 25000, invoice_currency: null, current_freight_cost_usd: 1500 });
  await forwarderWithQuotes(db, noCur, "No Currency Freight", [{ original_amount: 1400 }]);

  // Blank invoice: "Set invoice value to calculate".
  const noInv = await fp(clients.noinvoice, { invoice_value: null, invoice_currency: null, current_freight_cost_usd: 1800 });
  await forwarderWithQuotes(db, noInv, "Blank Invoice Freight", [{ original_amount: 1700 }, { original_amount: 1650 }]);

  // A forwarder with no quotes, and no current freight cost.
  const noQ = await fp(clients.noquotes, { current_freight_cost_usd: null, project_duration_months: null });
  await forwarderWithQuotes(db, noQ, "Quiet Forwarder", [], { status: "RFQ Sent" });

  // Every quote on terms other than the final DDP / Sea / FCL.
  const diff = await fp(clients.diffterms, {});
  await forwarderWithQuotes(db, diff, "Other Terms One", [{ original_amount: 2500, incoterm: "FOB" }, { original_amount: 2400, incoterm: "DAP" }]);
  await forwarderWithQuotes(db, diff, "Other Terms Two", [{ original_amount: 2600, shipment_type: "LCL" }]);

  // High-volume air.
  const air = await fp(clients.air, {
    shipment_mode: "Air", shipment_type: "Air Freight", final_shipment_mode: "Air", final_shipment_type: "Air Freight",
    weight_kg: 450, cbm: 2.4, cartons: 30, invoice_value: 120000, current_freight_cost_usd: 4200,
    shipments_per_month: null, shipments_per_year: 520, project_duration_months: 36,
    origin_port: "SZX", destination_port: "LAX",
  });
  const airQuote = { shipment_mode: "Air", shipment_type: "Air Freight", chargeable_weight_kg: 480, actual_weight_kg: 450, lead_time_min_days: 3, lead_time_max_days: 5 };
  await forwarderWithQuotes(db, air, "Sky Express", [{ ...airQuote, original_amount: 3900 }]);
  await forwarderWithQuotes(db, air, "Jet Cargo", [{ ...airQuote, original_amount: 4100 }, { ...airQuote, original_amount: 3600, quote_completeness: "Incomplete / Needs Clarification" }]);
  await forwarderWithQuotes(db, air, "Withdrawn Air", [{ ...airQuote, original_amount: 3000 }], { status: "Withdrawn / No Response" });

  // Rounding: $3 on $2,000 = 0.15% (shows 0.2%); $1 = 0.05% (0.1%); $2.99 = 0.1495% (0.1%).
  const tie = await fp(clients.tie, { invoice_value: 2000, current_freight_cost_usd: 3, weight_kg: 5, cbm: 0.02, cartons: 1 });
  await forwarderWithQuotes(db, tie, "Penny Freight", [{ original_amount: 3 }, { original_amount: 1 }, { original_amount: 2.99 }]);

  // Special characters and long text, on the shared special client.
  const special = await fp(clients.special, { cargo_description: LONG_TEXT, special_handling: `${PREFIX} Fragile & handle with care — é ü ñ 🚚`, origin_country: "France", origin_city: "Le Havre", origin_port: "Le Havre" });
  await forwarderWithQuotes(db, special, "Fret Français & Fils 🚢", [{ original_amount: 3100, notes: LONG_TEXT }]);

  // Owned by expert 2.
  const other = await insertOne(db, "forwarder_projects", forwarderProject(users.expert2, clients.expert2, {}));
  await forwarderWithQuotes(db, other, "Expert Two Freight", [{ original_amount: 3300 }]);
}

// Real HTS codes (rates are representative) covering each program type the
// calculator gates on. Each 10-digit line has its 4-digit heading as parent.
const HTS_LINES = [
  ["8471", 0, "Automatic data processing machines and units thereof", null],
  ["8471300100", 1, "Portable automatic data processing machines, weighing not more than 10 kg", "Free"],
  ["6109", 0, "T-shirts, singlets, tank tops and similar garments, knitted or crocheted", null],
  ["6109100012", 1, "Of cotton: men's or boys' T-shirts, all white, short hemmed sleeves", "16.5%", "Free (AU,BH,CL,CO,IL,JO,KR,MA,OM,P,PA,PE,S,SG)"],
  ["7318", 0, "Screws, bolts, nuts, of iron or steel", null],
  ["7318158066", 1, "Bolts and bolts and their nuts or washers, of iron or steel, other", "8.5%"],
  ["8703", 0, "Motor cars and other motor vehicles principally designed for the transport of persons", null],
  ["8703800000", 1, "Other vehicles, with only electric motor for propulsion", "2.5%"],
  ["8708", 0, "Parts and accessories of the motor vehicles of headings 8701 to 8705", null],
  ["8708295060", 1, "Other parts and accessories of bodies, other", "2.5%"],
  ["9018", 0, "Instruments and appliances used in medical sciences", null],
  ["9018310040", 1, "Syringes, with or without needles: other", "Free"],
  ["8716", 0, "Trailers and semi-trailers; other vehicles, not mechanically propelled", null],
  ["8716390090", 1, "Other trailers and semi-trailers for the transport of goods, other", "3.1%"],
  ["8486", 0, "Machines and apparatus of a kind used solely or principally for semiconductor manufacture", null],
  ["8486100000", 1, "Machines and apparatus for the manufacture of boules or wafers", "Free"],
  ["8542", 0, "Electronic integrated circuits", null],
  ["8542310001", 1, "Processors and controllers", "Free"],
  ["3004", 0, "Medicaments consisting of mixed or unmixed products, in measured doses", null],
  ["3004909290", 1, "Other medicaments, other", "Free"],
  ["9403", 0, "Other furniture and parts thereof", null],
  ["9403608081", 1, "Other wooden furniture, other", "Free"],
  ["8806", 0, "Unmanned aircraft", null],
  ["8806210000", 1, "Other unmanned aircraft, with maximum take-off weight not more than 250 g", "Free"],
  ["2204", 0, "Wine of fresh grapes, including fortified wines", null],
  ["2204215060", 1, "Other wine, in containers not over 2 liters, other", "6.3¢/liter"],
];

async function seedHtsRelease(db) {
  const name = `${PREFIX}-local`;
  const current = check(await db.from("hts_releases").select("id, name").eq("status", "current").maybeSingle(), "find current release");
  if (current && current.name !== name) {
    console.warn(`qa:seed: a real HTS release (${current.name}) is current; leaving HTS data alone.`);
    return;
  }
  check(await db.from("hts_releases").delete().eq("name", name), "delete ZZQA release");

  const headings = new Map(HTS_LINES.filter(([, indent]) => indent === 0).map(([code, , desc]) => [code, desc]));
  const lines = HTS_LINES.map(([code, indent, description, rate, special]) => {
    const parent = indent > 0 ? headings.get(code.slice(0, 4)) : null;
    return {
      hts_code: code,
      chapter: code.slice(0, 2),
      indent,
      description: `${description}`,
      ancestor_descriptions: parent ? [parent] : [],
      units: indent > 0 ? ["No."] : [],
      general_rate: rate,
      special_rate: special ?? null,
      other_rate: rate ? "35%" : null,
      rate_from_code: rate ? code : null,
    };
  });
  const chapterCounts = {};
  for (const l of lines) chapterCounts[l.chapter] = (chapterCounts[l.chapter] ?? 0) + 1;

  const releaseId = await insertOne(db, "hts_releases", {
    name,
    title: `${PREFIX} local test release`,
    release_start_date: isoDate(-30),
    status: "importing",
    next_chapter: 100,
    chapter_counts: chapterCounts,
    row_count: lines.length,
  });
  await insertMany(db, "hts_lines", lines.map((l) => ({ release_id: releaseId, ...l })));
  check(await db.rpc("activate_hts_release", { p_release_id: releaseId, p_expected_rows: lines.length }), "activate release");
}

// USD per unit, representative values.
const FX = { EUR: 1.08, GBP: 1.27, CNY: 0.138, JPY: 0.0067, CAD: 0.73, AUD: 0.66, MXN: 0.055, INR: 0.012, PHP: 0.0175, VND: 0.0000395, THB: 0.029, HKD: 0.128, SGD: 0.77, KRW: 0.00073 };

async function seedFxRates(db) {
  for (const rateDate of [isoDate(-1), isoDate()]) {
    const rows = Object.entries(FX).map(([currency, rate_to_usd]) => ({ rate_date: rateDate, currency, rate_to_usd, source: "frankfurter" }));
    check(await db.from("fx_rates").upsert(rows, { onConflict: "rate_date,currency", ignoreDuplicates: true }), "insert fx_rates");
  }
}

async function main() {
  const { url, serviceRoleKey } = localStack();
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const password = randomPassword();
  const users = await upsertUsers(db, password);
  await resetData(db, users);
  const clients = await seedClients(db);
  await seedThreePl(db, users, clients);
  await seedForwarder(db, users, clients);
  await seedHtsRelease(db);
  await seedFxRates(db);

  console.log(`qa:seed: seeded ${url}`);
  console.log("Test users (password changes every run, not saved anywhere):");
  for (const u of USERS) console.log(`  ${u.email.padEnd(28)} ${u.role}${u.tariffEditor ? " + tariff_editor" : ""}`);
  console.log(`  password: ${password}`);
}

await main();
