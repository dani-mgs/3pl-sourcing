// Demo seed for the LOCAL Supabase stack only. Run: npm run demo:seed
//
// Creates six realistic demo clients for the client dashboard (plan sections
// 11-12, mockup v2), each with internal 3PL and/or Forwarder data at a set
// stage, all dated relative to today. Owned by two demo experts at
// @demo.example.test, independent of qa:seed. Every run deletes the previous
// demo data first (by the demo users and the fixed client names below), then
// inserts it again, and gives the demo users a new random password, which is
// printed once and never written to disk.
//
// Every internal-only field holds "INTERNAL-CANARY", so a leakage test can
// search client-facing pages for it. key_strength and key_weakness_risk stay
// clean: they feed the client-facing "Why" and "Trade-offs".
//
// The URL and service-role key come from `npx supabase status -o env` (the
// local CLI), never from .env files, and the script refuses to run unless the
// URL is the local API (127.0.0.1 / localhost, port 54321).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EMAIL_DOMAIN = "demo.example.test";
const CANARY = "INTERNAL-CANARY";
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
  console.error(`demo:seed: ${message}`);
  process.exit(1);
}

function check({ data, error }, what) {
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

// Today ± days, as a date or a timestamp (UTC).
function isoDate(offsetDays = 0) {
  return at(offsetDays).slice(0, 10);
}

function at(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

function canary(text) {
  return `${CANARY}: ${text}`;
}

function randomPassword() {
  return `${randomBytes(15).toString("base64url")}-Dm9`;
}

const USERS = [
  { key: "alex", email: `demo-expert1@${EMAIL_DOMAIN}`, firstName: "Alex Moreno" },
  { key: "priya", email: `demo-expert2@${EMAIL_DOMAIN}`, firstName: "Priya Nair" },
];

// Cleanup also goes by these names, so a re-run removes them even if the
// demo users were deleted in between.
const CLIENTS = {
  northwind: { name: "Northwind Coffee Roasters", business_model: "B2C" },
  brightline: { name: "Brightline Apparel", business_model: "B2C" },
  kettle: { name: "Kettle & Pine Home", business_model: "B2B & B2C" },
  solace: { name: "Solace Skincare", business_model: "B2C" },
  ridgeway: { name: "Ridgeway Outdoor", business_model: "B2B & B2C" },
  harbor: { name: "Harbor Pet Supply", business_model: "B2C" },
};

async function allUsers(db) {
  const users = [];
  for (let page = 1; ; page++) {
    const data = check(await db.auth.admin.listUsers({ page, perPage: 1000 }), "list users");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function upsertUsers(db, password) {
  const existing = new Map((await allUsers(db)).map((u) => [u.email, u]));
  const ids = {};
  for (const u of USERS) {
    const attrs = {
      password,
      email_confirm: true,
      app_metadata: { role: "logistics_expert", tariff_editor: null, first_name: u.firstName },
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

// Children before parents: three_pl_providers has no ON DELETE, forwarders
// and the client keys are RESTRICT. Covers anything the demo users own and
// any project on a demo client name.
async function resetData(db, userIds) {
  const owners = Object.values(userIds);
  const clientIds = await idsWhere(
    db.from("clients").select("id").in("name", Object.values(CLIENTS).map((c) => c.name)),
    "find clients",
  );

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

async function seedClients(db) {
  const ids = {};
  for (const [key, row] of Object.entries(CLIENTS)) {
    ids[key] = await insertOne(db, "clients", { ...row, created_at: at(-160), updated_at: at(-160) });
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 3PL

function threePlProject(ownerId, clientId, daysAgo, extra) {
  return {
    owner_id: ownerId,
    client_id: clientId,
    status: "Active",
    date_created: at(-daysAgo),
    updated_at: at(-Math.min(daysAgo, 2)),
    benchmark_period: "Last 12 months",
    core_cost_categories: "Storage, pick & pack, receiving, returns",
    summary_notes: canary("client is price-sensitive; CFO signs off anything over $5k/month."),
    assumptions_data_limitations: canary("order profile taken from the client's Shopify export; peak month estimated."),
    important_limitation: canary("incumbent invoices only cover 9 of the last 12 months."),
    ...extra,
  };
}

// cost: [storage, pick_pack, receiving, returns] per month, or null.
function provider(projectId, daysAgo, name, location, status, cost, extra = {}) {
  const [storage, pickPack, receiving, returns] = cost ?? [null, null, null, null];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    three_pl_project_id: projectId,
    company_name: name,
    location,
    status,
    provider_type: "3PL",
    website: `https://www.${slug}.example`,
    contact_person: "Sales team",
    email: `sales@${slug}.example`,
    currency: "USD",
    is_incumbent: false,
    // Every row sets every NOT NULL flag: a bulk insert sends the union of
    // the rows' keys, so a missing one would be null, not its default.
    receiving: true, storage: true, fulfillment: true, dispatch: true, returns: true, b2c: true, b2b: false,
    adhoc_kitting_bundling: false, adhoc_labelling: false, annual_inventory_count: false, cycle_count: true,
    inventory_count_on_request: false, one_time_system_setup: false, lot_batch_expiry_tracking: false,
    temp_controlled_storage: false, retail_edi_compliance: false, cross_docking: false,
    storage_cost: storage,
    pick_pack_cost: pickPack,
    receiving_cost: receiving,
    returns_cost: returns,
    created_at: at(-daysAgo),
    updated_at: at(-Math.max(daysAgo - 5, 1)),
    notes: canary(`call notes for ${name} kept in the team drive.`),
    key_notes: canary(`${name}: margin target discussed with the account manager.`),
    next_action: canary("follow up on the rate card."),
    source_basis: canary("rate card PDF and email thread."),
    footprint_source: canary("sales deck, not independently checked."),
    ...extra,
  };
}

async function insertProviders(db, rows) {
  const data = check(await db.from("three_pl_providers").insert(rows).select("id, company_name"), "insert three_pl_providers");
  return Object.fromEntries(data.map((r) => [r.company_name, r.id]));
}

async function recommend(db, projectId, priority, ids, daysAgo) {
  await insertOne(db, "recommendation", {
    three_pl_project_id: projectId,
    priority,
    provider_id_1: ids[0] ?? null,
    provider_id_2: ids[1] ?? null,
    provider_id_3: ids[2] ?? null,
    generated_at: at(-daysAgo),
  });
}

// Stage 5, recommendation ready (approval due in 5 days). Funnel:
// 12 contacted -> 9 replied -> 6 quoted -> 3 shortlisted -> 1 recommended.
// Not contacted: the incumbent (baseline) and one Do not Contact.
async function seedNorthwind(db, users, clients) {
  const p = await insertOne(db, "three_pl_projects", threePlProject(users.alex, clients.northwind, 55, {
    target_geography: "US East Coast + Texas",
    avg_monthly_orders: 1200, peak_monthly_orders: 2100, latest_month_orders: 1350,
    avg_monthly_units: 3100, peak_monthly_units: 5400,
    main_decision_focus: "Cost",
    key_capability_needs: "B2C DTC coffee subscriptions, lot/roast-date tracking, two-node network",
    special_handling_requirement: "Food-grade storage, FIFO by roast date",
    contract_period_months: 24,
  }));
  const d = 50;
  const ids = await insertProviders(db, [
    provider(p, d, "Eastgate Fulfillment", "Allentown, PA", "Baseline", [1850, 3240, 420, 260], { is_incumbent: true }),
    // Quoted and shortlisted.
    provider(p, d, "Harborline 3PL", "Edison, NJ + Dallas, TX", "Shortlisted", [1640, 2950, 400, 260], {
      assessment_status: "Move Recommended",
      key_strength: "Two nodes (NJ + TX) cut ground transit to 2 days for 85% of orders",
      key_weakness_risk: "Slightly longer setup: 6 weeks to go live",
      client_decision: "Move Recommended - awaiting client approval",
      lot_batch_expiry_tracking: true, onboarding_period_months: 2,
    }),
    provider(p, d, "Lone Star Logistics Hub", "Fort Worth, TX", "Shortlisted", [1700, 3000, 410, 240], {
      assessment_status: "Fit", key_strength: "Fast setup (3 weeks)", key_weakness_risk: "Single node in Texas; East Coast orders take 4 days",
    }),
    provider(p, d, "Blue Ridge Commerce Fulfillment", "Roanoke, VA", "Shortlisted", [1720, 3100, 400, 250], {
      assessment_status: "Fit", key_strength: "Food-grade certified", key_weakness_risk: "Higher returns fee",
    }),
    // Quoted, not shortlisted.
    provider(p, d, "Atlantic Pick & Pack", "Baltimore, MD", "Vetted", [1900, 3300, 450, 280], { assessment_status: "Fit" }),
    provider(p, d, "Keystone Warehousing", "Harrisburg, PA", "Vetted", [2100, 3400, 420, 300], { assessment_status: "Fit" }),
    provider(p, d, "QuickShip Depot", "Newark, NJ", "Unfit", [1500, 2600, 300, 200], {
      assessment_status: "Unfit",
      key_notes: canary("failed the site audit: pest-control log gaps. Do not tell the client the reason."),
    }),
    // Replied but didn't quote.
    provider(p, d, "Granite State Logistics", "Nashua, NH", "Unfit", null, { notes: canary("no Texas site.") }),
    provider(p, d, "Gulf Coast Fulfillment", "Houston, TX", "Unfit", null, { notes: canary("minimum 5,000 orders/month.") }),
    provider(p, d, "Metro Parcel Works", "Queens, NY", "Withdrawn / No Response", null, { notes: canary("declined: at capacity until Q2.") }),
    // No response.
    provider(p, d, "Summit Ecom Services", "Columbus, OH", "Withdrawn / No Response", null, { notes: canary("no reply after 3 follow-ups.") }),
    provider(p, d, "Bayview Commerce", "Jacksonville, FL", "Withdrawn / No Response", null, { notes: canary("no reply after 3 follow-ups.") }),
    provider(p, d, "Crescent Logistics", "Memphis, TN", "Withdrawn / No Response", null, { notes: canary("no reply after 3 follow-ups.") }),
    // Never contacted.
    provider(p, d, "Northstar Fulfillment", "Edison, NJ", "Do not Contact", null, {
      key_notes: canary("billing dispute with Move in 2025; blacklisted by ops."),
    }),
  ]);
  await recommend(db, p, "Cost Savings", [ids["Harborline 3PL"], ids["Lone Star Logistics Hub"], ids["Blue Ridge Commerce Fulfillment"]], 2);
}

// Stage 3, collecting quotes: 9 contacted -> 7 replied -> 4 quoted.
async function seedBrightlineThreePl(db, users, clients) {
  const p = await insertOne(db, "three_pl_projects", threePlProject(users.alex, clients.brightline, 30, {
    target_geography: "US West Coast",
    avg_monthly_orders: 1800, peak_monthly_orders: 3600, latest_month_orders: 1950,
    avg_monthly_units: 4300, peak_monthly_units: 8800,
    main_decision_focus: "Cost",
    key_capability_needs: "B2C DTC apparel, high returns volume, Shopify integration",
    contract_period_months: 24,
  }));
  const d = 26;
  await insertProviders(db, [
    provider(p, d, "Inland Empire Fulfillment", "Ontario, CA", "Baseline", [2600, 4860, 520, 900], { is_incumbent: true }),
    provider(p, d, "Pacific Crest Fulfillment", "Reno, NV", "Reviewing Quotation", [2400, 4500, 480, 820]),
    provider(p, d, "Sierra Commerce Logistics", "Sacramento, CA", "Reviewing Quotation", [2350, 4700, 500, 760]),
    provider(p, d, "Golden Gate Warehousing", "Hayward, CA", "Reviewing Quotation", [2900, 4400, 450, 880]),
    provider(p, d, "Mojave Distribution", "Victorville, CA", "Clarifications", [2200, 4950, 560, 940], {
      next_action: canary("ask whether the returns fee includes restocking."),
    }),
    provider(p, d, "Evergreen Apparel Logistics", "Kent, WA", "Waiting for Quotation", null),
    provider(p, d, "Valley Ecom Partners", "Fresno, CA", "Waiting for Quotation", null),
    provider(p, d, "Coastline Fulfillment", "Long Beach, CA", "Scheduled for Discovery Call", null),
    provider(p, d, "Redline Logistics", "Phoenix, AZ", "Withdrawn / No Response", null, { notes: canary("no reply after 2 follow-ups.") }),
    provider(p, d, "Sunset Pick & Ship", "San Diego, CA", "Withdrawn / No Response", null, { notes: canary("no reply after 2 follow-ups.") }),
  ]);
}

// Stage 6, setting up: the client approved Piedmont 7 days ago.
async function seedKettleThreePl(db, users, clients) {
  const p = await insertOne(db, "three_pl_projects", threePlProject(users.alex, clients.kettle, 95, {
    target_geography: "US Southeast",
    avg_monthly_orders: 900, peak_monthly_orders: 1600,
    avg_monthly_units: 2200,
    main_decision_focus: "Quality of Service",
    key_capability_needs: "Bulky home goods, B2B retail replenishment plus DTC",
    contract_period_months: 36,
  }));
  const d = 90;
  const ids = await insertProviders(db, [
    provider(p, d, "Kettle & Pine in-house warehouse", "Asheville, NC", "Baseline", [3100, 2900, 600, 300], { is_incumbent: true, provider_type: "In-house" }),
    provider(p, d, "Piedmont Fulfillment Co.", "Greensboro, NC", "Vetted", [2700, 2600, 520, 280], {
      assessment_status: "Awarded/Approved",
      client_decision: `Approved by the client on ${isoDate(-7)}; onboarding started`,
      key_strength: "Retail EDI compliance and white-glove handling for bulky items",
      key_weakness_risk: "Peak-season surcharge from November",
      retail_edi_compliance: true, b2b: true, onboarding_period_months: 2,
    }),
    provider(p, d, "Carolina Commerce Hub", "Charlotte, NC", "Completed / Closed", [2550, 2800, 540, 300], {
      assessment_status: "Fit", client_decision: "Not selected",
    }),
    provider(p, d, "Peachtree Logistics", "Atlanta, GA", "Completed / Closed", [2900, 2700, 500, 260], {
      assessment_status: "Fit", client_decision: "Not selected",
    }),
    provider(p, d, "Tidewater Storage", "Norfolk, VA", "Unfit", [2300, 2400, 450, 250], {
      assessment_status: "Unfit", key_notes: canary("no oversize handling equipment."),
    }),
    provider(p, d, "Blue Hen Fulfillment", "Wilmington, DE", "Withdrawn / No Response", null),
  ]);
  await recommend(db, p, "Quality of Service", [ids["Piedmont Fulfillment Co."], ids["Carolina Commerce Hub"], ids["Peachtree Logistics"]], 14);
}

// Stage 2, finding partners: 3 contacted, none quoted, no baseline yet.
async function seedSolace(db, users, clients) {
  const p = await insertOne(db, "three_pl_projects", threePlProject(users.priya, clients.solace, 6, {
    target_geography: "US nationwide (Midwest node)",
    avg_monthly_orders: 600, peak_monthly_orders: 1400,
    main_decision_focus: "Quality of Service",
    key_capability_needs: "Temperature-controlled storage, lot and expiry tracking",
    special_handling_requirement: "Store at 15-25°C; FEFO picking",
  }));
  const d = 5;
  const temp = { temp_controlled_storage: true, lot_batch_expiry_tracking: true };
  await insertProviders(db, [
    provider(p, d, "Lakeshore Beauty Logistics", "Chicago, IL", "Client Requirements Sent", null, temp),
    provider(p, d, "Heartland Cosmetics Fulfillment", "Indianapolis, IN", "Scheduled for Discovery Call", null, temp),
    provider(p, d, "Prairie Pick & Pack", "Kansas City, MO", "Contacted", null),
    provider(p, d, "Great Lakes Cold Chain", "Detroit, MI", "Potential / Not Contacted", null, temp),
    provider(p, d, "Twin Cities Commerce", "Minneapolis, MN", "Potential / Not Contacted", null),
    provider(p, d, "GlowShip Fulfillment", "Columbus, OH", "Do not Contact", null, {
      key_notes: canary("lost a client's stock in 2025; ops says never again."),
    }),
  ]);
}

// Stage 7, complete two months ago.
async function seedHarbor(db, users, clients) {
  const p = await insertOne(db, "three_pl_projects", threePlProject(users.priya, clients.harbor, 150, {
    status: "Completed",
    updated_at: at(-60),
    target_geography: "US Northeast",
    avg_monthly_orders: 2500, peak_monthly_orders: 4200,
    avg_monthly_units: 7000,
    main_decision_focus: "Turnaround Time",
    key_capability_needs: "Heavy pet food bags, subscription orders",
    contract_period_months: 12,
  }));
  const d = 145;
  const ids = await insertProviders(db, [
    provider(p, d, "Pawtucket Distribution", "Pawtucket, RI", "Baseline", [3400, 6200, 700, 300], { is_incumbent: true }),
    provider(p, d, "Bay State Fulfillment", "Worcester, MA", "Completed / Closed", [3100, 5600, 650, 280], {
      assessment_status: "Awarded/Approved",
      client_decision: `Approved by the client on ${isoDate(-75)}; live since ${isoDate(-60)}`,
      key_strength: "Same-day dispatch cut-off at 3pm", key_weakness_risk: "One node only",
    }),
    provider(p, d, "Hudson Valley Logistics", "Newburgh, NY", "Completed / Closed", [3000, 5900, 600, 320], {
      assessment_status: "Fit", client_decision: "Not selected",
    }),
    provider(p, d, "Nutmeg Commerce", "Hartford, CT", "Completed / Closed", [3300, 5700, 640, 290], {
      assessment_status: "Fit", client_decision: "Not selected",
    }),
    provider(p, d, "Granite Peak 3PL", "Manchester, NH", "Unfit", [2800, 5200, 500, 250], {
      assessment_status: "Unfit", key_notes: canary("floor load rating too low for pallets of kibble."),
    }),
    provider(p, d, "Cape Cod Pick & Pack", "Taunton, MA", "Withdrawn / No Response", null),
  ]);
  await recommend(db, p, "Turnaround Time", [ids["Bay State Fulfillment"], ids["Hudson Valley Logistics"], ids["Nutmeg Commerce"]], 80);
}

// ---------------------------------------------------------------------------
// Forwarder

function forwarderProject(ownerId, clientId, daysAgo, extra) {
  return {
    owner_id: ownerId,
    client_id: clientId,
    status: "Active",
    created_at: at(-daysAgo),
    updated_at: at(-Math.min(daysAgo, 1)),
    shipment_mode: "Sea",
    shipment_type: "FCL",
    current_incoterm: "DDP",
    final_shipment_mode: "Sea",
    final_shipment_type: "FCL",
    final_incoterm: "DDP",
    incoterms_to_compare: ["DDP"],
    invoice_currency: "USD",
    shipments_per_month: 1,
    project_duration_months: 12,
    packing_list_available: "Yes",
    packing_list_notes: canary("supplier's packing list has wrong carton count; corrected by hand."),
    dangerous_goods: "No",
    temperature_controlled: "No",
    stackable: "Yes",
    insurance_required: "Quote Both With and Without",
    brokerage_needed: "Yes",
    field_sources: {
      current_freight_cost_usd: canary("from the client's last three freight invoices."),
      invoice_value: canary("commercial invoice from the supplier, unverified."),
    },
    ...extra,
  };
}

// A forwarder and its quotes. size/region shape the profile fields the
// Market Report will coarsen.
async function forwarder(db, projectId, daysAgo, f, quotes = []) {
  const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const id = await insertOne(db, "forwarders", {
    forwarder_project_id: projectId,
    company_name: f.name,
    status: f.status,
    assessment: f.assessment ?? null,
    headquarters: f.hq,
    footprint: f.footprint,
    origin_coverage: f.originCoverage ?? "Vietnam, China, Thailand",
    destination_coverage: f.destinationCoverage ?? "US West Coast",
    website: `https://www.${slug}.example`,
    contact_person: "Ocean sales desk",
    contact_position: "Sales",
    email: `ocean@${slug}.example`,
    sea_freight: true, fcl: true, lcl: true, door_to_door: true, port_to_port: true,
    customs_brokerage: true, customs_import_assistance: true,
    air_freight: f.air ?? false,
    cargo_insurance: f.insurance ?? false,
    key_notes: f.keyNotes ?? canary(`${f.name}: rates negotiated off last year's tender.`),
    next_action: f.nextAction ?? canary("chase the final all-in rate."),
    created_at: at(-daysAgo),
    updated_at: at(-Math.max(daysAgo - 10, 1)),
  });
  if (quotes.length) {
    check(await db.from("forwarder_quotes").insert(quotes.map((q, i) => ({
      forwarder_id: id,
      shipment_mode: "Sea",
      shipment_type: "FCL",
      incoterm: "DDP",
      original_currency: "USD",
      exchange_rate_to_usd: 1,
      quote_completeness: "Complete / Comparable",
      quote_reference: `${slug.slice(0, 6).toUpperCase()}-${isoDate(-q.quotedDaysAgo).replaceAll("-", "")}-${i + 1}`,
      notes: canary("rate excludes the peak-season surcharge they mentioned on the call."),
      important_assumption: canary("assumes 2 free days at destination terminal."),
      created_at: at(-q.quotedDaysAgo),
      updated_at: at(-q.quotedDaysAgo),
      ...Object.fromEntries(Object.entries(q).filter(([k]) => k !== "quotedDaysAgo")),
      quote_date: isoDate(-q.quotedDaysAgo),
    }))), "insert forwarder_quotes");
  }
}

// Stage 5, decision due in 5 days. 12 forwarders, one quote each:
// 6 like-for-like (DDP / Sea / FCL, complete, forwarder still in the running)
// with median (9,420 + 9,800) / 2 = 9,610; 2 on DDU terms; 4 out of the
// running (Unfit, Do Not Contact, 2 Withdrawn / No Response), including the
// cheapest quote. The client sees 8 quotes, 6 like-for-like.
const BRIGHTLINE_FORWARDERS = [
  { name: "Pacific Bridge Logistics", hq: "Singapore", footprint: "Regional: 22 offices across Asia and the US", status: "Shortlisted", assessment: "Move Recommended", air: true, insurance: true,
    quote: { original_amount: 9000, lead_time_min_days: 24, lead_time_max_days: 28, rate_valid_until: isoDate(19), quotedDaysAgo: 9,
      overall_assessment: "Move Recommended", client_decision: "Move Recommended - Awaiting Client",
      key_strength: "Lowest like-for-like price; weekly sailings; in-house US customs clearance",
      key_weakness_risk: "Insurance extra (~$95 per container)" } },
  { name: "Lotus Freight", hq: "Ho Chi Minh City, Vietnam", footprint: "Mid-size: 8 offices in Vietnam, agents in the US", status: "Shortlisted", assessment: "Fit",
    quote: { original_amount: 9420, lead_time_min_days: 26, lead_time_max_days: 32, rate_valid_until: isoDate(19), quotedDaysAgo: 10, overall_assessment: "Fit",
      key_strength: "Weekend delivery to Ontario available (+$150)", key_weakness_risk: "Longer transit range" } },
  { name: "Saigon Harbor Shipping", hq: "Ho Chi Minh City, Vietnam", footprint: "Small: 2 offices, Cat Lai and Hai Phong", status: "Shortlisted", assessment: "Fit",
    quote: { original_amount: 9420, lead_time_min_days: 22, lead_time_max_days: 26, rate_valid_until: isoDate(19), quotedDaysAgo: 8, overall_assessment: "Fit",
      key_strength: "Fastest transit (22-26 days)", key_weakness_risk: "Weekday deliveries only" } },
  { name: "Meridian Ocean Logistics", hq: "Hong Kong", footprint: "Global: 140+ offices worldwide", status: "Vetted", assessment: "Fit", air: true, insurance: true, destinationCoverage: "US nationwide",
    quote: { original_amount: 9800, lead_time_min_days: 25, lead_time_max_days: 30, rate_valid_until: isoDate(9), quotedDaysAgo: 12, overall_assessment: "Fit" } },
  { name: "Redwood Gateway Freight", hq: "Los Angeles, CA", footprint: "Mid-size: 5 US offices, Asia agents", status: "Reviewing Quotation", assessment: "Under Assessment",
    quote: { original_amount: 10150, lead_time_min_days: 27, lead_time_max_days: 33, rate_valid_until: isoDate(25), quotedDaysAgo: 6, overall_assessment: "Under Assessment" } },
  { name: "Mekong Star Logistics", hq: "Can Tho, Vietnam", footprint: "Small: single office", status: "Negotiation", assessment: "Under Assessment",
    quote: { original_amount: 10600, lead_time_min_days: 28, lead_time_max_days: 35, rate_valid_until: isoDate(21), quotedDaysAgo: 7, overall_assessment: "Under Assessment" } },
  { name: "Busan Pacific Lines", hq: "Busan, South Korea", footprint: "Regional: 12 offices in Korea, Vietnam and the US", status: "Reviewing Quotation", assessment: "Under Assessment",
    quote: { original_amount: 8700, incoterm: "DDU (legacy term)", lead_time_min_days: 23, lead_time_max_days: 29, rate_valid_until: isoDate(20), quotedDaysAgo: 11, overall_assessment: "Under Assessment",
      key_weakness_risk: "Duties and taxes not included (DDU)" } },
  { name: "Orient Link Express", hq: "Shenzhen, China", footprint: "Large: 40 offices in China and Southeast Asia", status: "Reviewing Quotation", assessment: "Under Assessment", air: true,
    quote: { original_amount: 8950, incoterm: "DDU (legacy term)", lead_time_min_days: 25, lead_time_max_days: 31, rate_valid_until: isoDate(17), quotedDaysAgo: 9, overall_assessment: "Under Assessment",
      key_weakness_risk: "Duties and taxes not included (DDU)" } },
  { name: "Swift Tide Cargo", hq: "Da Nang, Vietnam", footprint: "Small: 3 offices", status: "Unfit", assessment: "Unfit",
    keyNotes: canary("failed reference check: no active US customs bond."),
    quote: { original_amount: 8300, lead_time_min_days: 20, lead_time_max_days: 24, rate_valid_until: isoDate(15), quotedDaysAgo: 13, overall_assessment: "Unfit" } },
  { name: "Golden Lantern Shipping", hq: "Taipei, Taiwan", footprint: "Regional: 15 offices", status: "Do Not Contact", assessment: "Unfit",
    keyNotes: canary("unpaid-surcharge dispute in 2025; ops blacklisted them."),
    quote: { original_amount: 9100, lead_time_min_days: 24, lead_time_max_days: 30, rate_valid_until: isoDate(12), quotedDaysAgo: 14, overall_assessment: "Unfit" } },
  { name: "Anchor Point Forwarding", hq: "Long Beach, CA", footprint: "Mid-size: 6 US offices", status: "Withdrawn / No Response", assessment: null,
    keyNotes: canary("stopped replying after the first quote; rate has expired."),
    quote: { original_amount: 9950, lead_time_min_days: 26, lead_time_max_days: 34, rate_valid_until: isoDate(-6), quotedDaysAgo: 28 } },
  { name: "SkyHarbor Air & Sea", hq: "Hanoi, Vietnam", footprint: "Mid-size: 10 offices, air specialist", status: "Withdrawn / No Response", assessment: null, air: true,
    keyNotes: canary("only quoted air; withdrew when we asked for sea."),
    quote: { original_amount: 21500, shipment_mode: "Air", shipment_type: "Air Freight", chargeable_weight_kg: 11000, lead_time_min_days: 4, lead_time_max_days: 6, rate_valid_until: isoDate(5), quotedDaysAgo: 20 } },
];

async function seedBrightlineForwarder(db, users, clients) {
  const p = await insertOne(db, "forwarder_projects", forwarderProject(users.alex, clients.brightline, 40, {
    origin_country: "Vietnam", origin_city: "Ho Chi Minh City", origin_port: "Cat Lai",
    destination_country: "United States", destination_city: "Los Angeles", destination_port: "Los Angeles",
    final_delivery_address: "Ontario, CA (client's 3PL)",
    weight_kg: 9500, cbm: 58, cartons: 950, units: 22800,
    cargo_description: "Apparel: knit tops and denim, cartoned, one 40ft container",
    packaging_type: "Cartons", hs_code: "6109.10",
    invoice_value: 60000, current_freight_cost_usd: 10000, current_freight_forwarder: "Current forwarder (client-booked)",
    shipments_per_month: 2, project_duration_months: 12,
    current_lead_time_days: 30, target_lead_time_days: 25,
  }));
  for (const f of BRIGHTLINE_FORWARDERS) {
    await forwarder(db, p, 35, f, [{
      origin: "Cat Lai, Ho Chi Minh City", destination: "Ontario, CA",
      actual_weight_kg: 9500, chargeable_weight_kg: 9500, cbm: 58, cost_of_goods_usd: 60000,
      ...f.quote,
    }]);
  }
}

// Stage 3: 2 of 5 quotes in, only one like-for-like (insufficient data).
async function seedKettleForwarder(db, users, clients) {
  const p = await insertOne(db, "forwarder_projects", forwarderProject(users.alex, clients.kettle, 12, {
    origin_country: "China", origin_city: "Ningbo", origin_port: "Ningbo-Zhoushan",
    destination_country: "United States", destination_city: "Savannah", destination_port: "Savannah",
    weight_kg: 12000, cbm: 62, cartons: 410,
    cargo_description: "Ceramic cookware and wooden furniture, palletised",
    invoice_value: 42000, current_freight_cost_usd: 6800,
    current_lead_time_days: 38, target_lead_time_days: 32,
  }));
  const q = { origin: "Ningbo", destination: "Greensboro, NC", actual_weight_kg: 12000, chargeable_weight_kg: 12000, cbm: 62 };
  await forwarder(db, p, 10, { name: "Yangtze Blue Logistics", hq: "Shanghai, China", footprint: "Large: 30 offices in China", status: "Reviewing Quotation", assessment: "Under Assessment", originCoverage: "China", destinationCoverage: "US East Coast" },
    [{ ...q, original_amount: 6300, lead_time_min_days: 32, lead_time_max_days: 38, rate_valid_until: isoDate(28), quotedDaysAgo: 3 }]);
  await forwarder(db, p, 10, { name: "Atlantic Crossing Freight", hq: "Savannah, GA", footprint: "Small: 2 US offices", status: "Reviewing Quotation", assessment: "Under Assessment", originCoverage: "China", destinationCoverage: "US East Coast" },
    [{ ...q, original_amount: 4100, incoterm: "FOB", lead_time_min_days: 34, lead_time_max_days: 40, rate_valid_until: isoDate(26), quotedDaysAgo: 2,
      key_weakness_risk: "FOB: ocean freight and duties not included" }]);
  await forwarder(db, p, 10, { name: "Silk Route Shipping", hq: "Ningbo, China", footprint: "Mid-size: 9 offices", status: "Waiting for Quotation", originCoverage: "China", destinationCoverage: "US East Coast" });
  await forwarder(db, p, 10, { name: "Magnolia Global Logistics", hq: "Atlanta, GA", footprint: "Mid-size: 7 US offices", status: "Waiting for Quotation", originCoverage: "China", destinationCoverage: "US East Coast" });
  await forwarder(db, p, 10, { name: "Eastwind Cargo", hq: "Qingdao, China", footprint: "Small: single office", status: "Withdrawn / No Response", originCoverage: "China", destinationCoverage: "US East Coast",
    keyNotes: canary("no reply after 3 follow-ups.") });
}

// Stage 4 with a EUR invoice: the Freight Cost Ratio can't be shown.
async function seedRidgeway(db, users, clients) {
  const p = await insertOne(db, "forwarder_projects", forwarderProject(users.priya, clients.ridgeway, 30, {
    origin_country: "Portugal", origin_city: "Porto", origin_port: "Leixões",
    destination_country: "United States", destination_city: "Newark", destination_port: "Port Newark",
    weight_kg: 7200, cbm: 54, cartons: 780,
    cargo_description: "Hiking boots and technical outerwear",
    invoice_value: 85000, invoice_currency: "EUR", current_freight_cost_usd: 4200,
    shipments_per_month: 2, project_duration_months: 18,
    current_lead_time_days: 18, target_lead_time_days: 16,
  }));
  const q = { origin: "Leixões, Porto", destination: "Newark, NJ", actual_weight_kg: 7200, chargeable_weight_kg: 7200, cbm: 54 };
  const eu = { originCoverage: "Portugal, Spain, Italy", destinationCoverage: "US East Coast" };
  await forwarder(db, p, 25, { name: "Lusitania Freight", hq: "Porto, Portugal", footprint: "Mid-size: 6 offices in Iberia", status: "Negotiation", assessment: "Fit", ...eu },
    [{ ...q, original_currency: "EUR", original_amount: 3500, exchange_rate_to_usd: 1.08, exchange_rate_source: "forwarder_document", exchange_rate_date: isoDate(-5),
      lead_time_min_days: 15, lead_time_max_days: 19, rate_valid_until: isoDate(24), quotedDaysAgo: 5, key_strength: "Lowest comparable price" }]);
  await forwarder(db, p, 25, { name: "Atlas Transatlantic", hq: "Rotterdam, Netherlands", footprint: "Global: 90 offices", status: "Reviewing Quotation", assessment: "Fit", air: true, ...eu },
    [{ ...q, original_amount: 3950, lead_time_min_days: 14, lead_time_max_days: 17, rate_valid_until: isoDate(20), quotedDaysAgo: 8 }]);
  await forwarder(db, p, 25, { name: "Iberian Ocean Services", hq: "Valencia, Spain", footprint: "Small: 2 offices", status: "Clarifications", assessment: "Under Assessment", ...eu },
    [{ ...q, original_amount: 4050, lead_time_min_days: 17, lead_time_max_days: 21, rate_valid_until: isoDate(18), quotedDaysAgo: 9 }]);
  await forwarder(db, p, 25, { name: "Northbound Logistics", hq: "Newark, NJ", footprint: "Mid-size: 4 US offices", status: "Reviewing Quotation", assessment: "Under Assessment", ...eu },
    [{ ...q, original_amount: 4300, lead_time_min_days: 16, lead_time_max_days: 20, rate_valid_until: isoDate(22), quotedDaysAgo: 6 }]);
  await forwarder(db, p, 25, { name: "Douro Cargo", hq: "Porto, Portugal", footprint: "Small: single office", status: "Reviewing Quotation", assessment: "Under Assessment", ...eu },
    [{ ...q, original_amount: 3400, incoterm: "DAP", lead_time_min_days: 16, lead_time_max_days: 20, rate_valid_until: isoDate(14), quotedDaysAgo: 7,
      key_weakness_risk: "DAP: duties and taxes not included" }]);
  await forwarder(db, p, 25, { name: "Cabo Verde Lines", hq: "Lisbon, Portugal", footprint: "Small: 3 offices", status: "Do Not Contact", assessment: "Unfit", ...eu,
    keyNotes: canary("lost a container in 2024 and refused the claim.") });
}

// ---------------------------------------------------------------------------
// Portal data (tables don't exist yet; seeded in later phases).
//
// TODO(Phase 1): client users (role client + app_metadata.client_id),
//   @demo.example.test: 2 for Northwind (coworkers see the same thing),
//   1 for each other client.
// TODO(Phase 2): client_updates. 2-4 published per engagement, spread over
//   the past weeks, with stage, headline, summary, next step and due date:
//   Northwind 3PL stage 5 (approval due T+5, needs action), Brightline
//   forwarder stage 5 (decision due T+5, needs action) and 3PL stage 3
//   (remaining quotes due T+12), Kettle & Pine 3PL stage 6 and forwarder
//   stage 3, Solace 3PL stage 2, Ridgeway forwarder stage 4, Harbor 3PL
//   stage 7. Plus one DRAFT update on the Kettle & Pine forwarder project
//   (must stay invisible to clients).
// TODO(Phase 3): client_requests in each state: Brightline forwarder
//   "Weekend delivery to Ontario?" answered ("Yes for Pacific Bridge and
//   Lotus (+$150). Saigon Harbor: weekdays only."), Brightline 3PL "Call me
//   about contract length" seen (wants_call), one sent, and Kettle & Pine's
//   3PL approval dated T-7.
// TODO(Market Report): client_entitlements. Brightline entitled to the paid
//   Market Report for its forwarder project; every other client (Ridgeway
//   included, the locked example) on the free tier.

// Self-check: the Brightline numbers the mockup depends on.
function checkBrightline() {
  const lfl = BRIGHTLINE_FORWARDERS
    .filter((f) => !["Unfit", "Do Not Contact", "Withdrawn / No Response"].includes(f.status))
    .map((f) => f.quote)
    .filter((q) => (q.incoterm ?? "DDP") === "DDP" && (q.shipment_mode ?? "Sea") === "Sea" && (q.shipment_type ?? "FCL") === "FCL")
    .map((q) => q.original_amount)
    .sort((a, b) => a - b);
  const median = (lfl[2] + lfl[3]) / 2;
  if (BRIGHTLINE_FORWARDERS.length !== 12 || lfl.length !== 6 || median !== 9610 || lfl.slice(0, 3).join() !== "9000,9420,9420") {
    fail(`Brightline data drifted: ${BRIGHTLINE_FORWARDERS.length} forwarders, like-for-like ${lfl.join(", ")}, median ${median}.`);
  }
  return { forwarders: BRIGHTLINE_FORWARDERS.length, likeForLike: lfl.length, median };
}

async function main() {
  const brightline = checkBrightline();
  const { url, serviceRoleKey } = localStack();
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const password = randomPassword();
  const users = await upsertUsers(db, password);
  await resetData(db, users);
  const clients = await seedClients(db);
  await seedNorthwind(db, users, clients);
  await seedBrightlineThreePl(db, users, clients);
  await seedBrightlineForwarder(db, users, clients);
  await seedKettleThreePl(db, users, clients);
  await seedKettleForwarder(db, users, clients);
  await seedSolace(db, users, clients);
  await seedRidgeway(db, users, clients);
  await seedHarbor(db, users, clients);

  console.log(`demo:seed: seeded ${url}`);
  console.log(`  ${Object.keys(CLIENTS).length} clients: ${Object.values(CLIENTS).map((c) => c.name).join(", ")}`);
  console.log(`  Brightline forwarder: ${brightline.forwarders} forwarders, ${brightline.likeForLike} like-for-like, median $${brightline.median.toLocaleString("en-US")}`);
  console.log("Demo users (password changes every run, not saved anywhere):");
  for (const u of USERS) console.log(`  ${u.email.padEnd(32)} logistics_expert (${u.firstName})`);
  console.log(`  password: ${password}`);
}

await main();
