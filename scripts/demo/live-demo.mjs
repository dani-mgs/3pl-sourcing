// npm run demo:live [-- --apply --confirm-project=<ref>] [--with-portal-user]
// npm run demo:remove [-- --apply --confirm-project=<ref>]
// (add --local to run against the local Supabase stack instead)
//
// Creates, or removes, one filled-in demo client, "Brightline Apparel (Demo)",
// so staff can try the app hands-on: a 3PL project and a forwarder project
// with partners, quotes and rate cards, a published client update on each, a
// published Market Report, three client requests and a saved duty estimate.
// How to run it: docs/qa/live-demo.md.
//
// Safety:
// - A dry run by default: it reads, prints what it would do, writes nothing.
//   Writing needs --apply; on production also --confirm-project=<ref> and
//   typing the ref at a prompt.
// - The target comes from DEMO_TARGET_URL / DEMO_TARGET_SERVICE_KEY (a new
//   sb_secret_ key; a legacy JWT is refused) and DEMO_OWNER_EMAIL, set in the
//   operator's own terminal, never from .env files; or, with --local, from
//   `npx supabase status` (local stack only). Keys, the owner's email and the
//   optional one-time password are never printed (the password once only).
// - Everything is built through the app's own code: the form parsers (Zod
//   checks, column caps), saveRateDetails, the FX provenance check, the
//   client-update and Market Report loaders and builders (shortlist-only
//   naming, the "Move's take" guard, the strict payload schemas), and the
//   duty-estimate builder and save_duty_estimate(). Two things are written
//   directly because their functions need a signed-in owner or client:
//   partner letters (as assign_partner_labels() does, with the database's
//   market_report_label_at()) and the client requests (the same columns and
//   frozen snapshots as submit_client_request() / submit_client_introduction()).
// - Idempotent: a re-run skips what exists and finishes what a failed run
//   left. It never changes a client, project or user it didn't create: the
//   demo client must carry the marker below on its projects.
// - Removal deletes only the demo client and everything under it, including
//   anything testers added there (listed first by the dry run).

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import {
  confirmationMatches,
  DEMO_CLIENT_NAME,
  DEMO_MARKER,
  DEMO_PORTAL_EMAIL,
  GuardError,
  maskEmail,
  parseArgs,
  redact,
  resolveTarget,
} from "./live-demo-guard.mjs";
import * as DATA from "./live-demo-data.mjs";
import { staffRole } from "@/lib/auth/roles";
import { parseProjectForm } from "@/lib/three-pl/parse-project-form";
import { parseProviderForm } from "@/lib/three-pl/parse-provider-form";
import { parseRecommendationForm } from "@/lib/three-pl/parse-recommendation-form";
import { saveRateDetails } from "@/lib/rate-details";
import { parseForwarderProjectForm } from "@/lib/forwarder/parse-project-form";
import { parseForwarderForm } from "@/lib/forwarder/parse-forwarder-form";
import { parseQuoteForm } from "@/lib/forwarder/parse-quote-form";
import { withVerifiedRateProvenance } from "@/lib/fx/server-rates";
import { utcToday } from "@/lib/client-updates/dates";
import { loadFirstNames, loadForwarderSource, loadThreePlSource } from "@/lib/client-updates/load-publish-source";
import { parsePublishForm } from "@/lib/client-updates/publish-inputs";
import { buildThreePlPayload } from "@/lib/client-updates/build-three-pl-payload";
import { buildForwarderPayload } from "@/lib/client-updates/build-forwarder-payload";
import { loadMarketReportSource } from "@/lib/client-updates/load-market-report-source";
import { anonymisedOrder, buildMarketReport, planMarketReport } from "@/lib/client-updates/build-market-report";
import { parseReportForm } from "@/lib/client-updates/market-report-inputs";
import { isShortlistedForwarder } from "@/lib/client-updates/partners";
import { LINK_CONFIRMATIONS, missingConfirmation, parseEstimateForm, parseLinkFields } from "@/lib/tariff/parse-estimate-form";
import { buildEstimate, estimateToRow } from "@/lib/tariff/server-estimate";
import { loadLinkSources, snapshotChoices, sourceVersion } from "@/lib/tariff/server-forwarder-link";
import { buildInputSnapshot, invoiceIncludesFreight } from "@/lib/tariff/forwarder-link";
import { defaultEntryDate } from "@/lib/tariff/entry-date";
import { saveDutyEstimate } from "@/lib/tariff/estimate-store";
import { generateOneTimePassword } from "@/lib/client-users/create-client-user";

const SECRETS = [];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const quoteRef = (name) => `DEMO-${slug(name).slice(0, 10).toUpperCase()}-1`;

function isoDate(offsetDays, today) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function form(fields) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const x of v) f.append(k, String(x));
    else f.set(k, String(v));
  }
  return f;
}

function check({ data, error }, what) {
  if (error) throw new Error(`${what} failed (${error.code ?? "error"}): ${error.message}`);
  return data;
}

function parsed(result, what) {
  if (!result.ok) throw new Error(`${what}: the app's validation refused it: ${result.error}`);
  return result;
}

// ---- Output ----------------------------------------------------------------------------

class Run {
  constructor(args) {
    this.args = args;
    this.apply = args.apply;
    this.writes = 0;
    this.lines = [];
  }
  line(verb, what) {
    const shown = this.apply ? verb : { create: "would create", update: "would update", delete: "would delete" }[verb] ?? verb;
    console.log(`  ${shown.padEnd(13)} ${what}`);
  }
  // Runs a write only with --apply; counts it for the partial-run message.
  async write(verb, what, fn) {
    this.line(verb, what);
    if (!this.apply) return null;
    const out = await fn();
    this.writes++;
    return out;
  }
  checkpoint(step) {
    if (this.apply && this.args.failAfter === step) {
      throw new Error(`forced failure after "${step}" (--fail-after, local test only)`);
    }
  }
}

// ---- Target, owner ---------------------------------------------------------------------

function localStatus() {
  try {
    const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const env = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
    return { url: env.API_URL, secretKey: env.SECRET_KEY };
  } catch {
    return null;
  }
}

async function allUsers(db) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users failed (${error.code ?? "error"})`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function findOwner(db, email) {
  const owner = (await allUsers(db)).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!owner) throw new GuardError(`DEMO_OWNER_EMAIL (${maskEmail(email)}) isn't a user on this project.`);
  if (!staffRole(owner.app_metadata)) {
    throw new GuardError(`DEMO_OWNER_EMAIL (${maskEmail(email)}) isn't a staff user (logistics expert or admin).`);
  }
  return owner;
}

// ---- What's under the demo client ------------------------------------------------------

async function findDemo(db) {
  const clients = check(await db.from("clients").select("id, name, business_model").ilike("name", DEMO_CLIENT_NAME), "find the demo client");
  const client = clients.find((c) => c.name.trim().toLowerCase() === DEMO_CLIENT_NAME.toLowerCase());
  if (!client) return null;
  const tp = check(await db.from("three_pl_projects").select("id, summary_notes, owner_id").eq("client_id", client.id), "3PL projects");
  const fp = check(await db.from("forwarder_projects").select("id, field_sources, owner_id").eq("client_id", client.id), "forwarder projects");
  const marked = (p, kind) => (kind === "tp" ? (p.summary_notes ?? "").includes(DEMO_MARKER) : p.field_sources?.demo_seed === DEMO_MARKER);
  return {
    client,
    threePl: tp.filter((p) => marked(p, "tp")),
    forwarder: fp.filter((p) => marked(p, "fp")),
    otherThreePl: tp.filter((p) => !marked(p, "tp")),
    otherForwarder: fp.filter((p) => !marked(p, "fp")),
  };
}

// Everything under the demo client, and what of it the seed didn't create.
async function inventory(db, demo) {
  const clientId = demo.client.id;
  const tpIds = [...demo.threePl, ...demo.otherThreePl].map((p) => p.id);
  const fpIds = [...demo.forwarder, ...demo.otherForwarder].map((p) => p.id);
  const inIds = (q, col, ids) => (ids.length ? q.in(col, ids) : q.in(col, ["00000000-0000-0000-0000-000000000000"]));
  const providers = check(await inIds(db.from("three_pl_providers").select("id, company_name, three_pl_project_id"), "three_pl_project_id", tpIds), "3PLs");
  const forwarders = check(await inIds(db.from("forwarders").select("id, company_name, forwarder_project_id"), "forwarder_project_id", fpIds), "forwarders");
  const quotes = check(await inIds(db.from("forwarder_quotes").select("id, quote_reference, forwarder_id"), "forwarder_id", forwarders.map((f) => f.id)), "quotes");
  const updates = check(await db.from("client_updates").select("id, headline, is_draft").eq("client_id", clientId), "client updates");
  const reports = check(await db.from("client_market_reports").select("id").eq("client_id", clientId), "market reports");
  const requests = check(await db.from("client_requests").select("id, kind, message").eq("client_id", clientId), "client requests");
  const estimates = check(await inIds(db.from("duty_estimates").select("id, label"), "forwarder_project_id", fpIds), "duty estimates");
  const portal = check(await db.from("profiles").select("id").eq("client_id", clientId), "portal users");
  const users = portal.length ? (await allUsers(db)).filter((u) => portal.some((p) => p.id === u.id)) : [];

  const seedProviders = new Set(DATA.PROVIDERS.map((p) => p.name));
  const seedForwarders = new Set(DATA.FORWARDERS.map((f) => f.name));
  const seedHeadlines = new Set([DATA.THREE_PL_UPDATE.headline, DATA.FORWARDER_UPDATE.headline]);
  const seedMessages = new Set(Object.values(DATA.REQUESTS).map((r) => r.message));
  const extras = [
    ...demo.otherThreePl.map((p) => `3PL project ${p.id} (no demo marker)`),
    ...demo.otherForwarder.map((p) => `forwarder project ${p.id} (no demo marker)`),
    ...providers.filter((p) => !seedProviders.has(p.company_name)).map((p) => `3PL "${p.company_name}"`),
    ...forwarders.filter((f) => !seedForwarders.has(f.company_name)).map((f) => `forwarder "${f.company_name}"`),
    ...quotes.filter((q) => !(q.quote_reference ?? "").startsWith("DEMO-")).map((q) => `quote ${q.quote_reference ?? q.id}`),
    ...updates.filter((u) => !seedHeadlines.has(u.headline)).map((u) => `client update "${u.headline}"${u.is_draft ? " (draft)" : ""}`),
    ...(reports.length > 1 ? [`${reports.length - 1} extra Market Report(s)`] : []),
    ...requests.filter((r) => !seedMessages.has(r.message)).map((r) => `client request (${r.kind})`),
    ...estimates.filter((e) => e.label !== DATA.ESTIMATE.label).map((e) => `duty estimate "${e.label ?? e.id}"`),
    ...users.filter((u) => u.email !== DEMO_PORTAL_EMAIL).map((u) => `portal user ${maskEmail(u.email)}`),
  ];
  return { tpIds, fpIds, providers, forwarders, quotes, updates, reports, requests, estimates, users, extras };
}

function printExtras(inv) {
  if (!inv.extras.length) {
    console.log("\nNothing under the demo client that the seed didn't create.");
    return;
  }
  console.log(`\nUnder the demo client but NOT from the seed (${inv.extras.length}; demo:remove deletes these too):`);
  for (const e of inv.extras) console.log(`  - ${e}`);
}

// ---- Seed: projects and partners -------------------------------------------------------

async function ensureClient(run, db, demo) {
  if (demo) {
    if ((demo.otherThreePl.length || demo.otherForwarder.length) && !demo.threePl.length && !demo.forwarder.length) {
      throw new GuardError(`A client named "${DEMO_CLIENT_NAME}" exists with projects this script didn't create. Not touching it.`);
    }
    run.line("exists", `client "${DEMO_CLIENT_NAME}"`);
    return demo.client.id;
  }
  const row = await run.write("create", `client "${DEMO_CLIENT_NAME}"`, async () =>
    check(await db.from("clients").insert({ name: DATA.CLIENT.name, business_model: DATA.CLIENT.businessModel }).select("id").single(), "insert client"),
  );
  return row?.id ?? null;
}

async function ensurePlan(run, db, clientId) {
  const existing = clientId ? check(await db.from("client_entitlements").select("id, tier").eq("client_id", clientId).maybeSingle(), "plan") : null;
  if (existing?.tier === "market_report") return run.line("exists", "Market Report plan (paid)");
  await run.write(existing ? "update" : "create", "Market Report plan (paid)", async () =>
    check(await db.from("client_entitlements").upsert({ client_id: clientId, tier: "market_report" }, { onConflict: "client_id" }), "set plan"),
  );
}

async function ensureThreePlProject(run, db, demo, clientId, owner) {
  if (demo?.threePl.length) {
    run.line("exists", "3PL project (US West Coast)");
    return demo.threePl[0].id;
  }
  const p = parsed(parseProjectForm(form(DATA.THREE_PL_PROJECT)), "3PL project");
  const row = await run.write("create", "3PL project (US West Coast)", async () =>
    check(await db.from("three_pl_projects").insert({
      ...p.data,
      client_id: clientId,
      owner_id: owner.id,
      status: "Active",
      // The marker demo:remove looks for (internal notes, staff-only).
      summary_notes: `${DEMO_MARKER}. Fictional demo data for trying the app; remove with npm run demo:remove.`,
    }).select("id").single(), "insert 3PL project"),
  );
  return row?.id ?? null;
}

function providerForm(p) {
  const site = slug(p.name);
  const [storage, pickPack, receiving, returns] = p.costs ?? [];
  const flags = { receiving: true, storage: true, fulfillment: true, dispatch: true, returns: true, b2c: true, cycle_count: true };
  const allFlags = ["receiving", "storage", "fulfillment", "dispatch", "adhoc_kitting_bundling", "adhoc_labelling", "returns",
    "annual_inventory_count", "cycle_count", "inventory_count_on_request", "one_time_system_setup", "lot_batch_expiry_tracking",
    "temp_controlled_storage", "retail_edi_compliance", "cross_docking", "b2b", "b2c"];
  return form({
    company_name: p.name,
    provider_type: "3PL",
    website: `www.${site}.example`,
    location: p.location,
    contact_person: "Sales team",
    email: `sales@${site}.example`,
    ...Object.fromEntries(allFlags.map((f) => [f, flags[f] ? "true" : "false"])),
    is_incumbent: p.incumbent ? "true" : "false",
    currency: "USD",
    storage_cost: storage, pick_pack_cost: pickPack, receiving_cost: receiving, returns_cost: returns,
    status: p.status,
    assessment_status: p.assessment,
    key_strength: p.strength,
    key_weakness_risk: p.weakness,
    notes: p.notes,
    ...(p.rates ?? {}),
  });
}

async function ensureProviders(run, db, projectId) {
  const existing = projectId
    ? check(await db.from("three_pl_providers").select("id, company_name").eq("three_pl_project_id", projectId), "3PLs")
    : [];
  const withRates = existing.length
    ? new Set(check(await db.from("rate_details").select("provider_id").in("provider_id", existing.map((e) => e.id)), "rate cards").map((r) => r.provider_id))
    : new Set();
  const ids = {};
  for (const p of DATA.PROVIDERS) {
    const result = parsed(parseProviderForm(providerForm(p)), `3PL ${p.name}`);
    const found = existing.find((e) => e.company_name === p.name);
    let id = found?.id ?? null;
    if (found) run.line("exists", `3PL ${p.name}`);
    else {
      const row = await run.write("create", `3PL ${p.name}${p.costs ? "" : " (no rate card: not enough data to rank)"}`, async () =>
        check(await db.from("three_pl_providers").insert({ three_pl_project_id: projectId, ...result.data }).select("id").single(), `insert 3PL ${p.name}`),
      );
      id = row?.id ?? null;
    }
    // The rate card, as the add/edit 3PL actions save it (finishes a partial run too).
    if (p.rates && !(id && withRates.has(id))) {
      await run.write("create", `rate card for ${p.name}`, async () => {
        if (!(await saveRateDetails(db, id, result.rates, "create"))) throw new Error(`rate card for ${p.name} wasn't saved`);
      });
    }
    ids[p.name] = id;
  }
  return ids;
}

async function ensureRecommendation(run, db, projectId, providerIds) {
  const existing = projectId ? check(await db.from("recommendation").select("id").eq("three_pl_project_id", projectId).maybeSingle(), "recommendation") : null;
  if (existing) return run.line("exists", "3PL recommendation (top three)");
  const [a, b, c] = DATA.RECOMMENDATION.top.map((n) => providerIds[n] ?? "00000000-0000-4000-8000-000000000000");
  const r = parsed(parseRecommendationForm(form({ priority: DATA.RECOMMENDATION.priority, provider_id_1: a, provider_id_2: b, provider_id_3: c })), "recommendation");
  await run.write("create", `3PL recommendation (${DATA.RECOMMENDATION.priority}: ${DATA.RECOMMENDATION.top.join(", ")})`, async () =>
    check(await db.from("recommendation").insert({ three_pl_project_id: projectId, ...r.data, generated_at: new Date().toISOString() }), "insert recommendation"),
  );
}

async function ensureForwarderProject(run, db, demo, clientId, owner) {
  if (demo?.forwarder.length) {
    run.line("exists", "forwarder project (Ho Chi Minh City -> Los Angeles)");
    return demo.forwarder[0].id;
  }
  const p = parsed(parseForwarderProjectForm(form(DATA.FORWARDER_PROJECT)), "forwarder project");
  const row = await run.write("create", "forwarder project (Ho Chi Minh City -> Los Angeles)", async () =>
    check(await db.from("forwarder_projects").insert({
      ...p.data,
      status: "Active",
      client_id: clientId,
      owner_id: owner.id,
      // The marker demo:remove looks for (field_sources isn't shown anywhere).
      field_sources: { demo_seed: DEMO_MARKER },
    }).select("id").single(), "insert forwarder project"),
  );
  return row?.id ?? null;
}

function forwarderForm(f) {
  const site = slug(f.name);
  const caps = { sea_freight: true, fcl: true, lcl: true, door_to_door: true, port_to_port: true, customs_brokerage: true,
    customs_import_assistance: true, air_freight: !!f.air, cargo_insurance: !!f.insurance, road_freight: false, courier_express: false };
  return form({
    company_name: f.name,
    website: `www.${site}.example`,
    headquarters: f.hq,
    footprint: f.footprint,
    email: `quotes@${site}.example`,
    origin_coverage: "Vietnam, China, Thailand",
    destination_coverage: "US West Coast",
    ...Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, v ? "true" : "false"])),
    status: f.status,
    assessment: f.assessment,
    key_notes: f.keyNotes,
  });
}

function quoteForm(f, today) {
  const q = f.quote;
  return form({
    shipment_mode: q.mode ?? "Sea",
    shipment_type: q.type ?? "FCL",
    origin: "Cat Lai, Ho Chi Minh City",
    destination: "Ontario, CA",
    incoterm: q.incoterm ?? "DDP",
    actual_weight_kg: 9500,
    chargeable_weight_kg: q.chargeable ?? 9500,
    cbm: 58,
    cost_of_goods_usd: 60000,
    original_currency: "USD",
    original_amount: q.amount,
    exchange_rate_to_usd: 1,
    lead_time_min_days: q.lead[0],
    lead_time_max_days: q.lead[1],
    quote_completeness: "Complete / Comparable",
    quote_date: isoDate(-q.quotedDaysAgo, today),
    rate_valid_until: isoDate(q.validDays, today),
    quote_reference: quoteRef(f.name),
    key_strength: q.strength,
    key_weakness_risk: q.weakness,
    overall_assessment: q.overall,
    client_decision: q.decision,
  });
}

async function ensureForwarders(run, db, projectId, today) {
  const existing = projectId ? check(await db.from("forwarders").select("id, company_name").eq("forwarder_project_id", projectId), "forwarders") : [];
  const quotes = existing.length
    ? check(await db.from("forwarder_quotes").select("id, forwarder_id, quote_reference").in("forwarder_id", existing.map((e) => e.id)), "quotes")
    : [];
  const ids = {};
  for (const f of DATA.FORWARDERS) {
    const fwd = parsed(parseForwarderForm(forwarderForm(f)), `forwarder ${f.name}`);
    const quote = parsed(parseQuoteForm(quoteForm(f, today)), `quote of ${f.name}`);
    const found = existing.find((e) => e.company_name === f.name);
    let id = found?.id ?? null;
    if (found) run.line("exists", `forwarder ${f.name}`);
    else {
      const row = await run.write("create", `forwarder ${f.name} (${f.status})`, async () =>
        check(await db.from("forwarders").insert({ ...fwd.data, forwarder_project_id: projectId }).select("id").single(), `insert forwarder ${f.name}`),
      );
      id = row?.id ?? null;
    }
    if (id && quotes.some((q) => q.forwarder_id === id && q.quote_reference === quoteRef(f.name))) {
      run.line("exists", `quote of ${f.name}`);
    } else {
      const terms = `${f.quote.incoterm ?? "DDP"} / ${f.quote.mode ?? "Sea"}`;
      const expiry = f.quote.validDays < 0 ? ", expired" : "";
      await run.write("create", `quote of ${f.name} ($${f.quote.amount}, ${terms}${expiry})`, async () => {
        // As createQuote does: the FX source/date re-checked on the server.
        const row = await withVerifiedRateProvenance(db, quote.data, null);
        check(await db.from("forwarder_quotes").insert({ ...row, forwarder_id: id }), `insert quote of ${f.name}`);
      });
    }
    ids[f.name] = id;
  }
  return ids;
}

// ---- Seed: what the client sees --------------------------------------------------------

function publishForm(u, ids, today) {
  const fields = {
    stage: u.stage,
    headline: u.headline,
    summary: u.summary,
    nextStep: u.nextStep,
    nextStepDue: isoDate(u.nextStepDueDays, today),
    needsClientAction: u.needsClientAction ? "on" : null,
    partnerIds: u.partners.map((n) => ids[n]),
    recommendedId: ids[u.recommended],
    basedOn: u.basedOn,
    includeAnnual: u.includeAnnual ? "on" : null,
    contactEmail: "",
  };
  u.milestones.forEach((m, i) => {
    fields[`milestone_label_${i}`] = m.label;
    fields[`milestone_planned_${i}`] = m.plannedDays == null ? "" : isoDate(m.plannedDays, today);
    fields[`milestone_actual_${i}`] = m.actualDays == null ? "" : isoDate(m.actualDays, today);
  });
  u.reasons.forEach((r, i) => (fields[`reason_${i}`] = r));
  u.tradeOffs.forEach((t, i) => (fields[`tradeOff_${i}`] = t));
  for (const s of u.sections) fields[`section_${s}`] = "on";
  return form(fields);
}

// As saveClientUpdateDraft + publishClientUpdate: the payload rebuilt from live
// data, a draft with its inputs, then published. The owner is the author.
async function ensureUpdate(run, db, kind, projectId, partnerIds, owner, today) {
  const column = kind === "forwarder" ? "forwarder_project_id" : "three_pl_project_id";
  const data = kind === "forwarder" ? DATA.FORWARDER_UPDATE : DATA.THREE_PL_UPDATE;
  const label = `${kind === "forwarder" ? "forwarder" : "3PL"} client update "${data.headline}"`;
  const rows = projectId ? check(await db.from("client_updates").select("id, is_draft").eq(column, projectId), "client updates") : [];
  if (rows.some((r) => !r.is_draft)) return run.line("exists", `${label} (published)`);
  if (!run.apply) {
    // Partner ids only exist after --apply creates them; the form itself is checked then.
    return run.line("create", `${label} (built and validated from live data at --apply)`);
  }
  const inputs = parsed(parsePublishForm(publishForm(data, partnerIds, today)), label).data;
  const loaded = kind === "forwarder" ? await loadForwarderSource(db, projectId) : await loadThreePlSource(db, projectId);
  if (!loaded) throw new Error(`${label}: project not found`);
  const names = await loadFirstNames(db, [owner.id]);
  const people = { authorFirstName: names.get(owner.id) ?? null, ownerFirstName: names.get(owner.id) ?? null };
  const built = kind === "forwarder" ? buildForwarderPayload(loaded.source, inputs, people, today) : buildThreePlPayload(loaded.source, inputs, people);
  if (!built.ok) throw new Error(`${label}: the app's builder refused it: ${built.error}`);
  const fields = {
    stage: inputs.stage, headline: inputs.headline, summary: inputs.summary, next_step: inputs.nextStep,
    next_step_due: inputs.nextStepDue, needs_client_action: inputs.needsClientAction,
  };
  await run.write("create", `${label} (published)`, async () => {
    const draft = rows.find((r) => r.is_draft);
    let id = draft?.id;
    if (id) check(await db.from("client_updates").update({ ...fields, payload: built.payload }).eq("id", id), "update draft");
    else {
      id = check(await db.from("client_updates")
        .insert({ ...fields, payload: built.payload, [column]: projectId, is_draft: true, created_by: owner.id })
        .select("id").single(), "insert draft").id;
    }
    check(await db.from("client_update_inputs").upsert({ client_update_id: id, inputs }, { onConflict: "client_update_id" }), "save inputs");
    check(await db.from("client_updates").update({ is_draft: false, published_by: owner.id }).eq("id", id).eq("is_draft", true), "publish");
  });
}

// As publishMarketReport: plan, the report form through parseReportForm (with
// the "Move's take" guard), letters as assign_partner_labels() gives them,
// the payload from buildMarketReport.
async function ensureMarketReport(run, db, projectId, owner, today) {
  const existing = projectId ? check(await db.from("client_market_reports").select("id").eq("forwarder_project_id", projectId), "reports") : [];
  if (existing.length) {
    run.line("exists", "Market Report (published)");
    return;
  }
  if (!run.apply) {
    for (const f of DATA.FORWARDERS) {
      if (f.take && f.take.length > 140) throw new Error(`Move's take for ${f.name} is too long`);
    }
    return run.line("create", "partner letters and Market Report (built, guard-checked and validated from live data at --apply)");
  }
  const loaded = await loadMarketReportSource(db, projectId);
  if (!loaded) throw new Error("Market Report: project not found");
  const nameToId = new Map(loaded.source.forwarders.map((f) => [f.company_name, f.id]));
  const shortlistIds = loaded.source.forwarders.filter(isShortlistedForwarder).map((f) => f.id);
  const recommended = nameToId.get(DATA.MARKET_REPORT.recommended) ?? null;
  const planned = planMarketReport(loaded.source, shortlistIds.includes(recommended) ? recommended : null, today, loaded.labels.byForwarder);
  const takeOf = new Map(DATA.FORWARDERS.map((f) => [nameToId.get(f.name), f.take ?? ""]));
  const fields = { recommended };
  for (const p of planned) {
    const hint = loaded.hints.get(p.id);
    fields[`size:${p.id}`] = hint?.size ?? "";
    fields[`region:${p.id}`] = hint?.region ?? "";
    fields[`take:${p.id}`] = p.outcome === "not_taken_forward" ? "" : takeOf.get(p.id) ?? "";
  }
  const inputs = parsed(parseReportForm(form(fields), planned.map((p) => p.id), shortlistIds, loaded.identities), "Market Report form").data;

  const order = anonymisedOrder(planned);
  const missing = order.filter((id) => !loaded.labels.byForwarder.has(id));
  await run.write("create", `${missing.length} partner letter(s)`, async () => {
    let next = loaded.labels.used;
    for (const id of missing) {
      const label = check(await db.rpc("market_report_label_at", { p_index: next }), "market_report_label_at");
      check(await db.from("market_report_partner_labels").insert({ forwarder_project_id: projectId, forwarder_id: id, label }), "insert letter");
      next++;
    }
  });
  run.checkpoint("labels");
  const labelRows = check(await db.from("market_report_partner_labels").select("forwarder_id, label").eq("forwarder_project_id", projectId), "letters");
  const labels = new Map(labelRows.filter((r) => r.forwarder_id).map((r) => [r.forwarder_id, r.label]));
  const names = await loadFirstNames(db, [owner.id]);
  const built = buildMarketReport(loaded.source, inputs, labels, { authorFirstName: names.get(owner.id) ?? null }, today);
  if (!built.ok) throw new Error(`Market Report: the app's builder refused it: ${built.error}`);
  await run.write("create", "Market Report (published)", async () =>
    check(await db.from("client_market_reports").insert({ forwarder_project_id: projectId, payload: built.payload, inputs, published_by: owner.id }), "insert report"),
  );
}

// The rows submit_client_request() / submit_client_introduction() insert,
// column for column, frozen snapshots included. The author is the demo portal
// user if there is one ("Someone at your company" otherwise).
async function ensureRequests(run, db, clientId, tpId, fpId, authorId) {
  const have = clientId ? check(await db.from("client_requests").select("id, kind, message, partner_label, status").eq("client_id", clientId), "requests") : [];
  const latestUpdate = async (column, id) =>
    id ? (check(await db.from("client_updates").select("id, headline, published_at, payload").eq(column, id).eq("is_draft", false)
      .order("published_at", { ascending: false }).order("created_at", { ascending: false }).limit(1), "latest update")[0] ?? null) : null;

  // Approval of the 3PL recommendation.
  if (have.some((r) => r.kind === "approve")) run.line("exists", "client request: approval");
  else {
    await run.write("create", "client request: approval of the 3PL recommendation", async () => {
      const u = await latestUpdate("three_pl_project_id", tpId);
      if (!u || typeof u.payload?.recommendation !== "object" || !u.payload.recommendation) throw new Error("no published 3PL update with a recommendation");
      check(await db.from("client_requests").insert({
        client_id: clientId, three_pl_project_id: tpId, forwarder_project_id: null, client_update_id: u.id, kind: "approve",
        message: DATA.REQUESTS.approve.message, wants_call: false,
        decision_snapshot: { headline: u.headline, publishedAt: u.published_at, projectKind: "three_pl",
          route: u.payload?.project?.route ?? null, recommendation: u.payload?.recommendation ?? null },
        created_by: authorId,
      }), "insert approval");
    });
  }

  // A question on the forwarder project.
  if (have.some((r) => r.kind === "question" && r.message === DATA.REQUESTS.question.message)) run.line("exists", "client request: question");
  else {
    await run.write("create", "client request: question on the forwarder project", async () => {
      const u = await latestUpdate("forwarder_project_id", fpId);
      check(await db.from("client_requests").insert({
        client_id: clientId, three_pl_project_id: null, forwarder_project_id: fpId, client_update_id: u?.id ?? null, kind: "question",
        message: DATA.REQUESTS.question.message, wants_call: DATA.REQUESTS.question.wantsCall === true, decision_snapshot: null,
        created_by: authorId,
      }), "insert question");
    });
  }

  // An introduction to a lettered forwarder of the latest report.
  if (have.some((r) => r.kind === "introduction" && r.status !== "answered")) run.line("exists", "client request: introduction");
  else {
    await run.write("create", `client request: introduction (the letter of ${DATA.REQUESTS.introduction.introductionFor})`, async () => {
      const [report] = check(await db.from("client_market_reports").select("id, payload, published_at").eq("forwarder_project_id", fpId)
        .order("published_at", { ascending: false }).order("created_at", { ascending: false }).limit(1), "latest report");
      const fwd = check(await db.from("forwarders").select("id").eq("forwarder_project_id", fpId).eq("company_name", DATA.REQUESTS.introduction.introductionFor).single(), "forwarder");
      const letter = check(await db.from("market_report_partner_labels").select("label").eq("forwarder_id", fwd.id).single(), "letter").label;
      const row = report?.payload?.partners?.find((p) => p.label === `Partner ${letter}`);
      if (!row || !["quoted_not_selected", "quote_expired", "different_terms", "didnt_quote"].includes(row.outcome)) {
        throw new Error(`Partner ${letter} can't be asked for in the latest report`);
      }
      check(await db.from("client_requests").insert({
        client_id: clientId, forwarder_project_id: fpId, client_market_report_id: report.id, kind: "introduction", partner_label: letter,
        message: DATA.REQUESTS.introduction.message, wants_call: false,
        decision_snapshot: {
          reportPublishedAt: report.published_at,
          route: report.payload?.project?.route ?? null,
          partner: { label: row.label, outcome: row.outcome, priceUsd: row.priceUsd, leadMinDays: row.leadMinDays, leadMaxDays: row.leadMaxDays, likeForLike: row.likeForLike },
        },
        created_by: authorId,
      }), "insert introduction");
    });
  }
}

// As saveEstimate: the form through parseEstimateForm / parseLinkFields, the
// link checks of checkLinkedEstimate (ownership is the owner's own project),
// the calculation by buildEstimate, saved by saveDutyEstimate through
// save_duty_estimate(). Skipped with a warning if the HTS code isn't there.
async function ensureEstimate(run, db, fpId, quoteForwarderId, owner, today) {
  const existing = fpId ? check(await db.from("duty_estimates").select("id").eq("forwarder_project_id", fpId).eq("label", DATA.ESTIMATE.label), "estimates") : [];
  if (existing.length) return run.line("exists", "duty estimate");
  if (!run.apply) return run.line("create", `duty estimate (HTS ${DATA.ESTIMATE.htsCode}; skipped with a warning if the HTS data hasn't got it)`);
  const quote = check(await db.from("forwarder_quotes").select("id").eq("forwarder_id", quoteForwarderId).limit(1), "quote")[0];
  const sources = await loadLinkSources(db, fpId, quote?.id ?? null);
  if (!sources) throw new Error("duty estimate: project or quote not found");
  const entry = defaultEntryDate(today, sources.quote?.lead_time_min_days, sources.quote?.lead_time_max_days);
  const fields = {
    hts_code: DATA.ESTIMATE.htsCode, origin_country: DATA.ESTIMATE.originCountry, shipment_mode: DATA.ESTIMATE.mode,
    customs_value: sources.project.invoice_value, original_currency: sources.project.invoice_currency ?? "USD",
    entry_date: entry.date, label: DATA.ESTIMATE.label,
    forwarder_project_id: fpId, forwarder_quote_id: quote?.id ?? "", source_version: sourceVersion(sources),
    ...Object.fromEntries(Object.keys(LINK_CONFIRMATIONS).map((k) => [`confirm_${k}`, "on"])),
  };
  const f = form(fields);
  const input = parsed(parseEstimateForm(f, today), "duty estimate").data;
  const link = parseLinkFields(f);
  if ("error" in link || !link.linked) throw new Error(`duty estimate link: ${link.error ?? "not linked"}`);
  const deductionOffered = invoiceIncludesFreight(sources.project.current_incoterm);
  const missing = missingConfirmation(link.data.confirmed, { deductionOffered, quantityEntered: input.quantity != null }, "saving");
  if (missing) throw new Error(`duty estimate: ${missing}`);
  const withDeduction = { ...input, deductionUsd: link.data.deductionUsd };
  const built = await buildEstimate(db, withDeduction, today);
  if (!built.ok) {
    if (/isn't in the current HTS|HTS data hasn't been imported/.test(built.error)) {
      console.warn(`  WARNING      duty estimate skipped: ${built.error}`);
      return;
    }
    throw new Error(`duty estimate: ${built.error}`);
  }
  await run.write("create", `duty estimate "${DATA.ESTIMATE.label}"`, async () => {
    const saved = await saveDutyEstimate(owner.id, {
      ...estimateToRow(built.estimate, input.label),
      forwarder_project_id: fpId,
      forwarder_quote_id: quote?.id ?? null,
      input_snapshot: buildInputSnapshot(sources.project, sources.quote, snapshotChoices(withDeduction, sources, today)),
    }, { client: db });
    if (!saved.ok) throw new Error(`duty estimate: ${saved.error}`);
  });
}

// As createClientUserAccount: a client user with a one-time password, which
// must be changed at first sign-in. Printed once, here, and nowhere else.
async function ensurePortalUser(run, db, clientId) {
  const existing = (await allUsers(db)).find((u) => u.email === DEMO_PORTAL_EMAIL);
  if (existing) {
    run.line("exists", `portal user ${DEMO_PORTAL_EMAIL} (to get in again: Client access -> Reset password)`);
    return existing.id;
  }
  let password = null;
  const created = await run.write("create", `portal user ${DEMO_PORTAL_EMAIL} (role client, must change password)`, async () => {
    password = generateOneTimePassword();
    SECRETS.push(password);
    const { data, error } = await db.auth.admin.createUser({
      email: DEMO_PORTAL_EMAIL,
      password,
      email_confirm: true,
      app_metadata: { role: "client", client_id: clientId, first_name: "Demo", must_change_password: true },
    });
    if (error) throw new Error(`create portal user failed (${error.code ?? "error"})`);
    return data.user.id;
  });
  if (password) {
    console.log(`\n  One-time password for ${DEMO_PORTAL_EMAIL} (shown once, saved nowhere): ${password}\n`);
  }
  return created;
}

async function seed(run, db, owner) {
  const today = utcToday();
  const demo = await findDemo(db);
  if (demo) printExtras(await inventory(db, demo));
  console.log(`\n${run.apply ? "Seeding" : "Dry run: would seed"} "${DEMO_CLIENT_NAME}" (owner ${maskEmail(owner.email)}):`);

  const clientId = await ensureClient(run, db, demo);
  await ensurePlan(run, db, clientId);
  run.checkpoint("client");
  const tpId = await ensureThreePlProject(run, db, demo, clientId, owner);
  run.checkpoint("three-pl");
  const providerIds = await ensureProviders(run, db, tpId);
  await ensureRecommendation(run, db, tpId, providerIds);
  run.checkpoint("providers");
  const fpId = await ensureForwarderProject(run, db, demo, clientId, owner);
  const forwarderIds = await ensureForwarders(run, db, fpId, today);
  run.checkpoint("forwarders");
  await ensureUpdate(run, db, "three_pl", tpId, providerIds, owner, today);
  await ensureUpdate(run, db, "forwarder", fpId, forwarderIds, owner, today);
  run.checkpoint("updates");
  await ensureMarketReport(run, db, fpId, owner, today);
  run.checkpoint("report");
  const portalId = run.args.withPortalUser ? await ensurePortalUser(run, db, clientId) : null;
  const author = portalId ?? (await existingPortalUserId(db, clientId));
  await ensureRequests(run, db, clientId, tpId, fpId, author);
  run.checkpoint("requests");
  await ensureEstimate(run, db, fpId, forwarderIds[DATA.ESTIMATE.quoteOf], owner, today);
}

async function existingPortalUserId(db, clientId) {
  if (!clientId) return null;
  const u = (await allUsers(db)).find((x) => x.email === DEMO_PORTAL_EMAIL && x.app_metadata?.client_id === clientId);
  return u?.id ?? null;
}

// ---- Remove ----------------------------------------------------------------------------

async function remove(run, db) {
  const demo = await findDemo(db);
  if (!demo) {
    console.log(`\nNo client named "${DEMO_CLIENT_NAME}": nothing to remove.`);
    return;
  }
  if (!demo.threePl.length && !demo.forwarder.length) {
    if (demo.otherThreePl.length || demo.otherForwarder.length) {
      throw new GuardError(`"${DEMO_CLIENT_NAME}" has no project with the demo marker, so it wasn't made by this script. Not removing it.`);
    }
    console.log(`\n"${DEMO_CLIENT_NAME}" has no projects (a partial seed); it and its plan will be removed.`);
  }
  const inv = await inventory(db, demo);
  for (const u of inv.users) {
    if (u.app_metadata?.role !== "client") throw new GuardError(`A non-client user is linked to the demo client (${maskEmail(u.email)}). Not removing anything.`);
  }
  printExtras(inv);
  console.log(`\n${run.apply ? "Removing" : "Dry run: would remove"} "${DEMO_CLIENT_NAME}" and everything under it:`);
  const del = async (what, n, fn) => (n ? run.write("delete", `${n} ${what}`, fn) : null);
  await del("client request(s)", inv.requests.length, async () => check(await db.from("client_requests").delete().eq("client_id", demo.client.id), "delete requests"));
  await del("duty estimate(s)", inv.estimates.length, async () => check(await db.from("duty_estimates").delete().in("forwarder_project_id", inv.fpIds), "delete estimates"));
  await del("Market Report(s)", inv.reports.length, async () => check(await db.from("client_market_reports").delete().eq("client_id", demo.client.id), "delete reports"));
  await del("client update(s) and their inputs", inv.updates.length, async () => check(await db.from("client_updates").delete().eq("client_id", demo.client.id), "delete updates"));
  await del("forwarder(s) and their quotes", inv.forwarders.length, async () => check(await db.from("forwarders").delete().in("forwarder_project_id", inv.fpIds), "delete forwarders"));
  await del("forwarder project(s) and their partner letters", inv.fpIds.length, async () => check(await db.from("forwarder_projects").delete().in("id", inv.fpIds), "delete forwarder projects"));
  await del("3PL(s) and their rate cards", inv.providers.length, async () => check(await db.from("three_pl_providers").delete().in("three_pl_project_id", inv.tpIds), "delete 3PLs"));
  await del("3PL project(s) and the recommendation", inv.tpIds.length, async () => check(await db.from("three_pl_projects").delete().in("id", inv.tpIds), "delete 3PL projects"));
  for (const u of inv.users) {
    await run.write("delete", `portal user ${u.email === DEMO_PORTAL_EMAIL ? DEMO_PORTAL_EMAIL : maskEmail(u.email)}`, async () => {
      const { error } = await db.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`delete portal user failed (${error.code ?? "error"})`);
    });
  }
  await run.write("delete", `client "${DEMO_CLIENT_NAME}" and its plan`, async () => check(await db.from("clients").delete().eq("id", demo.client.id), "delete client"));
}

// ---- Main ------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args, process.env, args.local ? localStatus() : null);
  SECRETS.push(target.key, target.ownerEmail);
  const db = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const run = new Run(args);
  console.log(`demo:${args.command === "remove" ? "remove" : "live"}: target ${target.isLocal ? "LOCAL stack" : `production project ${target.ref}`}, ${args.apply ? "APPLY (writes)" : "dry run (no writes)"}`);

  if (args.apply && !target.isLocal) {
    if (!process.stdin.isTTY) throw new GuardError("--apply on production asks you to type the project ref; run it in an interactive terminal.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(`Type the project ref (${target.ref}) to write to PRODUCTION: `);
    rl.close();
    if (!confirmationMatches(typed, target.ref)) throw new GuardError("The typed ref didn't match. Nothing was written.");
  }

  try {
    if (args.command === "remove") await remove(run, db);
    else await seed(run, db, await findOwner(db, target.ownerEmail));
  } catch (err) {
    if (run.writes > 0) {
      console.error(`\nPARTIAL RUN: ${run.writes} write(s) were made before this error. It's safe to re-run the same command ` +
        "(it skips what exists and finishes the rest), or to remove everything with npm run demo:remove.");
    }
    throw err;
  }
  console.log(args.apply
    ? `\nDone: ${run.writes} write(s).`
    : `\nDry run only: nothing was written. Add --apply${target.isLocal ? "" : ` --confirm-project=${target.ref}`} to ${args.command === "remove" ? "remove" : "seed"}.`);
}

main().catch((err) => {
  const msg = redact(err instanceof Error ? err.message : String(err), SECRETS);
  console.error(`demo: ${err instanceof GuardError ? "refused: " : "error: "}${msg}`);
  process.exit(1);
});
