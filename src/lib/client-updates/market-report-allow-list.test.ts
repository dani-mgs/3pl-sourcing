import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { anonymisedOrder, buildMarketReport, planMarketReport } from "./build-market-report";
import { toForwarderSource } from "./load-publish-source";
import { profileHints, toIdentities } from "./load-market-report-source";
import { provisionalLabels } from "./market-report-labels";
import { parseReportForm } from "./market-report-inputs";
import { MARKET_REPORT_TOP_LEVEL_KEYS, type MarketReportPayload } from "./market-report-schema";
import { CANARY, FORWARDERS, TODAY, forwarderId, forwarderProjectRow, forwarderRows, quoteRows } from "./__fixtures__/sources";

// The Market Report allow-list drift test. The report is built from FULL
// database rows in which every forwarder and quote column the builder must
// not use carries a unique sentinel (text, numbers and dates alike). The
// payload's key paths must equal the lists below exactly, per kind of row,
// and no sentinel may appear anywhere in it.

// Columns the builder reads to work out prices, terms and outcomes. Every
// other column gets a sentinel.
const FORWARDER_USED = new Set(["id", "forwarder_project_id", "company_name", "status", "assessment"]);
const QUOTE_USED = new Set([
  "id",
  "forwarder_id",
  "shipment_mode",
  "shipment_type",
  "incoterm",
  "actual_weight_kg",
  "chargeable_weight_kg",
  "cost_of_goods_usd",
  "original_currency",
  "original_amount",
  "exchange_rate_to_usd",
  "duties_taxes_usd",
  "other_charges_usd",
  "quote_completeness",
  "lead_time_min_days",
  "lead_time_max_days",
  "rate_valid_until",
  "forwarders",
]);

const sentinels: string[] = [];
function sentinel(column: string, value: unknown, i: number): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    const n = 7_000_000 + sentinels.length * 13 + i;
    sentinels.push(String(n));
    return n;
  }
  const s = `${CANARY} ZZLEAK-${column}-${i}`;
  sentinels.push(s);
  return s;
}

function poison(row: Record<string, unknown>, used: Set<string>, i: number) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, used.has(k) || v == null ? v : sentinel(k, v, i)]));
}

const forwarders = forwarderRows().map((r, i) => poison(r, FORWARDER_USED, i));
const quotes = quoteRows().map((q, i) => poison(q, QUOTE_USED, i));
// Validity dates are read (expired quotes) but never shared.
const VALIDITY_DATES = [...new Set(quotes.map((q) => q.rate_valid_until).filter((d): d is string => typeof d === "string"))];

function fullReport(): MarketReportPayload {
  const source = toForwarderSource(forwarderProjectRow(), forwarders, quotes);
  const hints = profileHints(forwarders);
  const form = new FormData();
  form.set("recommended", forwarderId(0));
  FORWARDERS.forEach((_, i) => {
    const id = forwarderId(i);
    form.set(`size:${id}`, hints.get(id)?.size ?? "mid_size");
    form.set(`region:${id}`, hints.get(id)?.region ?? "southeast_asia");
    form.set(`take:${id}`, "Steady service on this lane");
  });
  const ids = FORWARDERS.map((_, i) => forwarderId(i));
  const parsed = parseReportForm(form, ids, ids.slice(0, 3), toIdentities(forwarders));
  if (!parsed.ok) throw new Error(parsed.error);
  const order = anonymisedOrder(planMarketReport(source, forwarderId(0), TODAY));
  const labels = provisionalLabels({ byForwarder: new Map(), used: 0 }, order);
  const result = buildMarketReport(source, parsed.data, labels, { authorFirstName: "Beah" }, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}

function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.length ? [...new Set(value.flatMap((v) => paths(v, `${prefix}[]`)))] : [`${prefix}[]`];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

const REPORT_PATHS = ["v", "kind", "project.route", "project.facts[]", "author.firstName", "today.costUsd", "partners[]"];
const NAMED_KEYS = ["leadMaxDays", "leadMinDays", "likeForLike", "name", "outcome", "priceUsd", "region", "size", "take"];
const ANONYMOUS_KEYS = ["label", "leadMaxDays", "leadMinDays", "likeForLike", "outcome", "priceUsd", "region", "size", "take"];
const NOT_TAKEN_FORWARD_KEYS = ["label", "outcome", "region", "size"];

describe("Market Report allow-list", () => {
  test("the top-level keys match market_report_payload_ok() in the latest migration that defines it", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((s) => s.includes("function public.market_report_payload_ok"))
      .at(-1)!;
    const list = /k\.key not in \(([^)]*)\)/.exec(sql)![1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...MARKET_REPORT_TOP_LEVEL_KEYS].sort());
  });

  test("the report has exactly the allow-listed paths, and each kind of row exactly its keys", () => {
    const report = fullReport();
    const top = paths({ ...report, partners: [] });
    expect(top.sort()).toEqual([...REPORT_PATHS].sort());
    const kinds = { named: 0, anonymous: 0, out: 0 };
    for (const p of report.partners) {
      const keys = Object.keys(p).sort();
      if ("name" in p) {
        kinds.named++;
        expect(keys).toEqual(NAMED_KEYS);
      } else if (p.outcome === "not_taken_forward") {
        kinds.out++;
        expect(keys).toEqual(NOT_TAKEN_FORWARD_KEYS);
      } else {
        kinds.anonymous++;
        expect(keys).toEqual(ANONYMOUS_KEYS);
      }
    }
    expect(kinds).toEqual({ named: 3, anonymous: 5, out: 4 });
  });

  test("no sentinel from any forwarder or quote column reaches the report", () => {
    const json = JSON.stringify(fullReport());
    expect(sentinels.length).toBeGreaterThan(100);
    expect(json).not.toContain(CANARY);
    expect(json).not.toMatch(/zzleak/i);
    for (const s of sentinels) expect(json, s).not.toContain(s);
  });

  test("no validity date, quote or record date, incoterm, status, or id", () => {
    const report = fullReport();
    const partners = JSON.stringify(report.partners);
    for (const d of VALIDITY_DATES) expect(partners, d).not.toContain(d);
    expect(partners).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(partners).not.toMatch(/DDU|DDP|FOB|DAP|incoterm/i);
    expect(JSON.stringify(report)).not.toMatch(/Unfit|Do Not Contact|Withdrawn|No Response|Vetted|Under Assessment|Move Recommended|Reviewing/);
    expect(JSON.stringify(report)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  test("anonymised partners' names never appear; only the shortlist is named", () => {
    const json = JSON.stringify(fullReport());
    // Words the named shortlist uses too ("Pacific" in Pacific Bridge) are
    // the named partner's, not a clue.
    const namedWords = new Set(FORWARDERS.slice(0, 3).flatMap((f) => f.name.split(" ")));
    for (const f of FORWARDERS.slice(3)) {
      expect(json, f.name).not.toContain(f.name);
      const distinctive = f.name.split(" ").filter((w) => !namedWords.has(w) && !/^(Logistics|Freight|Shipping|Cargo|Lines|Express|Forwarding|Air|Sea|&|Agents)$/.test(w));
      for (const word of distinctive) {
        expect(json, `${f.name}: ${word}`).not.toContain(word);
      }
    }
    for (const f of FORWARDERS.slice(0, 3)) expect(json).toContain(f.name);
  });
});
