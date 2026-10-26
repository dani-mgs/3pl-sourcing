import { describe, expect, test } from "vitest";
import { stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { program, row } from "@/lib/tariff/__fixtures__/spec-builders";
import { CALCULATED_ON, dutyRowTables, dutyTables, htsLine } from "./__fixtures__/duty-tables";
import { item, L1, L2, S1, scenario, workspace } from "./__fixtures__/workspace-builders";
import { computeWorkspaceResult } from "./server-compute";
import type { RateOverride } from "./workspace-schema";

// B-14: "Incomplete estimate" on a SKU, with the local duty rows of the
// regression's ZZQA LC Main (Section 301 forced labour and Section 232
// metals, both pending expert review; rows copied from the database, origins
// trimmed to what these cases read) and its four manual rates.
//
// The rule: a manual rate never changes the app's incomplete flag; it only
// marks the warning it covers. What the regression saw is the engine, not the
// manual rate: for EU origins forced labour is a 10% minimum total, so a SKU
// whose base duty already meets it (6109.10.00.12, 16.5%) gets a pending
// warning that adds nothing (counted: false) and isn't incomplete, with or
// without a manual rate; Mexico's row is a flat +10%, so there it is. The
// last test records that current behaviour, pending a decision on the rule.

const DANI = "00000000-0000-4000-8000-0000000000a1";
const EXCLUDES = ["section_232_metals", "section_232_vehicles", "section_232_timber", "section_232_semiconductors", "section_232_pharmaceuticals"];
const EU27 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

const t = () =>
  dutyTables({
    hts_lines: [htsLine("6109100012", "16.5%"), htsLine("7318158066", "8.5%"), htsLine("8471300100", "Free")],
    duty_programs: [
      program("section_301_forced_labor", "Section 301 (forced labour)", { trigger_origins: ["MX", ...EU27], sort_order: 10 }),
      program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
    ],
    ...dutyRowTables([
      row({ id: "fl-39", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.39", chapter99_heading_at_minimum: "9903.05.38", label: "EU member states", rate_type: "minimum_total", rate_pct: 10, origin_countries: EU27, excludes_programs: EXCLUDES, exclusion_heading: "9903.05.90", effective_from: "2026-07-24" }),
      row({ id: "fl-55", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.55", label: "Mexico", rate_type: "add", rate_pct: 10, origin_countries: ["MX"], excludes_programs: EXCLUDES, exclusion_heading: "9903.05.90", effective_from: "2026-07-24" }),
      row({ id: "fl-94", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.94", label: "USMCA goods of Mexico", rate_type: "exempt", rate_pct: null, origin_countries: ["MX"], condition_text: "the goods are entered free of duty under the USMCA (U.S. note 52(h))", effective_from: "2026-07-24" }),
      row({ id: "m-02", program_key: "section_232_metals", chapter99_heading: "9903.82.02", rate_pct: 50, origin_countries: null, hts_scope: "listed", scope: [{ hts_prefix: "73181580", article_description: null }], effective_from: "2026-06-08" }),
      row({ id: "m-06", program_key: "section_232_metals", chapter99_heading: "9903.82.06", rate_pct: 10, origin_countries: null, hts_scope: "listed", condition_text: "at least 85% of the article's aluminium, steel or copper content was smelted and cast (melted and poured) in the United States (U.S. note 16(e))", scope: [{ hts_prefix: "73181580", article_description: null }], effective_from: "2026-06-08" }),
    ]),
    duty_program_review_status: [],
    profiles: [{ id: DANI, email: "dani@test.local", first_name: "Dani" }],
  });

const rate = (id: string, over: Partial<RateOverride>): RateOverride => ({
  id: `00000000-0000-4000-8000-0000000004${id}`, kind: "add", layerKey: null, label: null, ratePercent: null, amountUsd: null,
  reason: "QA", engineRateText: null, engineAmountUsd: null, sortOrder: 0, setBy: DANI,
  setAt: "2026-10-23T09:00:00Z", changedBy: DANI, changedAt: "2026-10-23T09:00:00Z", ...over,
});
const SKU_A_RATES = [
  rate("01", { kind: "replace", layerKey: "base", ratePercent: "25", engineRateText: "8.5%", engineAmountUsd: "850.00" }),
  rate("02", { layerKey: "section_301_forced_labor", label: "Section 301 (forced labour)", ratePercent: "10", sortOrder: 1 }),
];
const SKU_B_RATES = [
  rate("03", { layerKey: "section_301_forced_labor", label: "Section 301 (forced labour)", ratePercent: "10" }),
  rate("04", { label: "QA anti-dumping duty", amountUsd: "500", sortOrder: 1 }),
];

async function flags(origin: string, withRates: boolean, skuAHts = "7318158066") {
  const w = workspace({
    entryDate: "2026-10-23",
    skuLines: [
      { id: L1, skuCode: "SKU-A", description: null, htsCode: skuAHts, quantity: "1000", dutyQuantity: null },
      { id: L2, skuCode: "SKU-B", description: null, htsCode: "8471300100", quantity: "500", dutyQuantity: null },
    ],
    scenarios: [
      scenario({
        id: S1, label: origin, originCountry: origin, freightTotalUsd: "2000", freightBasis: "value", entryType: "auto",
        items: [
          item({ skuLineId: L1, fobUnitPriceUsd: "10", overrides: withRates ? SKU_A_RATES : [] }),
          item({ skuLineId: L2, fobUnitPriceUsd: "20", overrides: withRates ? SKU_B_RATES : [] }),
        ],
      }),
    ],
  });
  const result = await computeWorkspaceResult(stubSupabase(t()), w, CALCULATED_ON);
  if (result.state !== "ready") throw new Error(result.state);
  const o = result.scenarios[0];
  if (o.state !== "complete") throw new Error(o.state);
  const sku = (id: string) => {
    const s = o.skus.find((k) => k.skuLineId === id);
    if (s?.status !== "ok") throw new Error("not ok");
    return {
      incomplete: s.duty.incomplete,
      warnings: s.duty.warnings.map((w) => `${w.programKey}:${w.kind}:${w.counted}${"coveredByManualRate" in w && w.coveredByManualRate ? ":covered" : ""}`),
      lines: s.duty.lines.map((l) => `${l.code}:${l.amountUsd}${"manual" in l && l.manual ? ":manual" : ""}`),
    };
  };
  return { origin: o.totals.status.incomplete, a: sku(L1), b: sku(L2) };
}

const ORIGINS = ["MX", "DE"];
const SKU_A_CODES = ["7318158066", "6109100012"];

describe("a manual rate never changes the incomplete flag", () => {
  test.each(ORIGINS.flatMap((o) => SKU_A_CODES.map((h) => [o, h])))("%s, SKU-A %s: the same flags with and without the manual rates", async (origin, hts) => {
    const [without, withRates] = [await flags(origin, false, hts), await flags(origin, true, hts)];
    const plain = (w: string) => w.replace(/:covered$/, "");
    expect(withRates.origin).toBe(without.origin);
    for (const k of ["a", "b"] as const) {
      expect(withRates[k].incomplete).toBe(without[k].incomplete);
      expect(withRates[k].warnings.map(plain)).toEqual(without[k].warnings);
    }
    // The covered programs are marked, not removed.
    expect(withRates.a.warnings).toContain(`${without.a.warnings.find((w) => w.startsWith("section_301_forced_labor"))}:covered`);
    expect(withRates.b.warnings).toContain(`${without.b.warnings[0]}:covered`);
  });

  test("steel screws (7318.15.80.66, 8.5%): incomplete in both origins (Section 232 metals pending; forced labour depends on it)", async () => {
    for (const origin of ORIGINS) {
      const f = await flags(origin, true);
      expect([f.origin, f.a.incomplete, f.b.incomplete]).toEqual([true, true, true]);
      expect(f.a.warnings).toEqual(["section_301_forced_labor:depends_on:true:covered", "section_232_metals:pending_review:true"]);
    }
  });
});

describe("the regression's case (SKU-A 6109.10.00.12, 16.5%): current engine behaviour", () => {
  test("Mexico (+10%): SKU-A is incomplete", async () => {
    const f = await flags("MX", true, "6109100012");
    expect([f.a.incomplete, f.b.incomplete]).toEqual([true, true]);
    expect(f.a.warnings).toEqual(["section_301_forced_labor:pending_review:true:covered"]);
  });

  test("Germany (10% minimum, already met by 16.5%): the pending program adds nothing, so SKU-A isn't incomplete, manual rate or not; SKU-B (Free) is", async () => {
    for (const withRates of [false, true]) {
      const f = await flags("DE", withRates, "6109100012");
      expect([f.origin, f.a.incomplete, f.b.incomplete]).toEqual([true, false, true]);
      expect(f.a.warnings).toEqual([`section_301_forced_labor:pending_review:false${withRates ? ":covered" : ""}`]);
    }
  });
});
