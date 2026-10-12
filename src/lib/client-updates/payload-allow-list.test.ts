import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildForwarderPayload } from "./build-forwarder-payload";
import { buildThreePlPayload } from "./build-three-pl-payload";
import { toForwarderSource, toThreePlSource } from "./load-publish-source";
import { PAYLOAD_TOP_LEVEL_KEYS } from "./payload-schema";
import {
  CANARY,
  FORWARDERS,
  PEOPLE,
  PROVIDERS,
  TODAY,
  forwarderId,
  forwarderProjectRow,
  forwarderRows,
  inputs,
  providerId,
  providerRows,
  quoteRows,
  recommendationRow,
  threePlProjectRow,
} from "./__fixtures__/sources";

// The allow-list drift test. Payloads are built from FULL database rows (every
// column, as `select *` would return them) in which every internal field
// carries INTERNAL-CANARY. The payload's key paths must equal the lists below
// exactly: a new key fails here until it's added on purpose (and reviewed for
// what it shows a client). Nothing internal may appear anywhere in it.

// Every internal status and assessment word the app uses. A client must never
// see one (the portal speaks in the seven client stages instead).
const INTERNAL_WORDS = [
  "Unfit",
  "Do Not Contact",
  "Do not Contact",
  "Withdrawn",
  "No Response",
  "Vetted",
  "Reviewing Quotation",
  "Waiting for Quotation",
  "Negotiation",
  "Clarifications",
  "Under Assessment",
  "Move Recommended",
  "Potential / Not Contacted",
  "Baseline",
  "Not Contacted",
  "Awarded",
];

function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.length ? [...new Set(value.flatMap((v) => paths(v, `${prefix}[]`)))] : [`${prefix}[]`];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

const FORWARDER_PATHS = [
  "v",
  "kind",
  "project.route",
  "project.facts[]",
  "author.firstName",
  "contact.firstName",
  "contact.email",
  "milestones[].label",
  "milestones[].planned",
  "milestones[].actual",
  "recommendation.name",
  "recommendation.reasons[]",
  "recommendation.tradeOffs[]",
  "recommendation.basedOn",
  "funnel[].step",
  "funnel[].count",
  "comparison.kind",
  "comparison.counts.quoted",
  "comparison.counts.likeForLike",
  "comparison.counts.differentTerms",
  "comparison.counts.expired",
  "comparison.show.cost",
  "comparison.show.leadTime",
  "comparison.show.fcr",
  "comparison.show.validity",
  "comparison.today.costUsd",
  "comparison.today.leadTimeDays",
  "comparison.today.fcrPct",
  "comparison.targetLeadTimeDays",
  "comparison.options[].name",
  "comparison.options[].role",
  "comparison.options[].comparability",
  "comparison.options[].costUsd",
  "comparison.options[].savingPct",
  "comparison.options[].savingUsd",
  "comparison.options[].leadMinDays",
  "comparison.options[].leadMaxDays",
  "comparison.options[].fcrPct",
  "comparison.options[].validUntil",
  "comparison.emptyCost",
  "comparison.savingsNote",
  "comparison.fcrIssue",
  "comparison.bestSaving.name",
  "comparison.bestSaving.pct",
  "comparison.bestSaving.usd",
  "comparison.annual.savingUsd",
  "comparison.annual.shipmentsPerYear",
];

const THREE_PL_PATHS = [
  "v",
  "kind",
  "project.route",
  "project.facts[]",
  "author.firstName",
  "contact.firstName",
  "contact.email",
  "milestones[].label",
  "milestones[].planned",
  "milestones[].actual",
  "recommendation.name",
  "recommendation.reasons[]",
  "recommendation.tradeOffs[]",
  "recommendation.basedOn",
  "funnel[].step",
  "funnel[].count",
  "comparison.kind",
  "comparison.quoted",
  "comparison.show.cost",
  "comparison.options[].name",
  "comparison.options[].role",
  "comparison.options[].location",
  "comparison.options[].savingPct",
  "comparison.emptyCost",
  "comparison.bestSaving.name",
  "comparison.bestSaving.pct",
];

function fullForwarderPayload() {
  const source = toForwarderSource(forwarderProjectRow(), forwarderRows(), quoteRows());
  const result = buildForwarderPayload(
    source,
    inputs({ partnerIds: [forwarderId(0), forwarderId(1), forwarderId(2)], recommendedId: forwarderId(0), includeAnnual: true }),
    PEOPLE,
    TODAY,
  );
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

function fullThreePlPayload() {
  const source = toThreePlSource(threePlProjectRow(), providerRows(), recommendationRow());
  const result = buildThreePlPayload(
    source,
    inputs({ partnerIds: [providerId(1), providerId(3), providerId(2)], recommendedId: providerId(1) }),
    PEOPLE,
  );
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

function expectNothingInternal(json: string, notNamed: string[]) {
  expect(json).not.toContain(CANARY);
  expect(json).not.toMatch(/zzleak/i);
  for (const word of INTERNAL_WORDS) expect(json, word).not.toContain(word);
  for (const name of notNamed) expect(json, name).not.toContain(name);
}

describe("client update payload allow-list", () => {
  test("the top-level keys match client_update_payload_ok() in the latest migration that defines it", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((sql) => sql.includes("function public.client_update_payload_ok"));
    const sql = defining.at(-1)!;
    const list = /k\.key not in \(([^)]*)\)/.exec(sql)![1];
    const keys = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...PAYLOAD_TOP_LEVEL_KEYS].sort());
  });

  test("a forwarder payload has exactly the allow-listed paths", () => {
    expect(paths(fullForwarderPayload()).sort()).toEqual([...FORWARDER_PATHS].sort());
  });

  test("a 3PL payload has exactly the allow-listed paths", () => {
    expect(paths(fullThreePlPayload()).sort()).toEqual([...THREE_PL_PATHS].sort());
  });

  test("nothing internal reaches a forwarder payload, and only the shortlist is named", () => {
    const notNamed = FORWARDERS.slice(3).map((f) => f.name);
    expectNothingInternal(JSON.stringify(fullForwarderPayload()), notNamed);
  });

  test("nothing internal reaches a 3PL payload, and only the shortlist is named", () => {
    const named = new Set(["Harborline Fulfillment", "Atlas Commerce Logistics", "Keystone 3PL"]);
    const notNamed = PROVIDERS.map((p) => p.name).filter((n) => !named.has(n));
    const json = JSON.stringify(fullThreePlPayload());
    expectNothingInternal(json, notNamed);
    // Rate-card amounts never reach a client: only percentages (the paths
    // above have no amount), and no rate-card total appears as a value.
    expect(json).not.toMatch(/\$|USD/);
    for (const p of PROVIDERS) {
      const rates = Object.values(p.costs ?? {});
      const total = rates.reduce((sum, r) => sum + r, 0);
      for (const amount of total > 0 ? [total] : []) {
        expect(json, `${p.name} ${amount}`).not.toMatch(new RegExp(`[:\\[,]${String(Number(amount.toFixed(2))).replace(".", "\\.")}[,}\\]]`));
      }
    }
  });

  test("the payload never carries internal ids", () => {
    const json = JSON.stringify([fullForwarderPayload(), fullThreePlPayload()]);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
