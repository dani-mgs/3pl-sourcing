import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { effectiveRates, oldestReview } from "@/lib/tariff/effective-rate";
import type { EstimateFormData } from "@/lib/tariff/parse-estimate-form";
import { isIncompleteEstimate, isProgramWarning } from "@/lib/tariff/programs";
import { buildEstimate } from "@/lib/tariff/server-estimate";
import { seedRows } from "@/lib/tariff/__fixtures__/seed-rows";
import { row } from "@/lib/tariff/__fixtures__/spec-builders";
import { createSupabaseStub, stubSupabase } from "@/lib/tariff/__fixtures__/supabase-stub";
import { CALCULATED_ON, dutyRowTables, dutyTables, reviewedStatus } from "./__fixtures__/duty-tables";
import type { DutyLineRequest } from "./duty-request";
import { loadSkuDuties } from "./server-duty-batch";
import type { SkuDuty } from "./sku-duty";

type Tables = ReturnType<typeof dutyTables>;
type Case = { hts: string; origin: string; value?: string; quantity?: string; unit?: string; entryDate?: string };

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const formInput = (c: Case): EstimateFormData => ({
  htsDigits: c.hts,
  originCountry: c.origin,
  shipmentMode: "Sea",
  customsValue: c.value ?? "10000",
  currency: "USD",
  exchangeRate: "1",
  exchangeRateSource: null,
  exchangeRateDate: null,
  quantity: c.quantity ?? null,
  label: null,
  entryDate: c.entryDate ?? CALCULATED_ON,
  deductionUsd: null,
});

const lineRequest = (c: Case, lineId = "L1"): DutyLineRequest => ({
  lineId,
  htsCode: c.hts,
  originCountry: c.origin,
  enteredValueUsd: c.value ?? "10000",
  dutyQuantity: c.quantity ?? null,
  dutyQuantityUnit: c.quantity ? (c.unit ?? "kg") : null,
});

// The batch answer for one line must be buildEstimate's, without the fees.
async function expectSameAsCalculator(tables: Tables, c: Case) {
  const estimate = await buildEstimate(stubSupabase(tables), formInput(c), CALCULATED_ON);
  const batch = await loadSkuDuties(stubSupabase(tables), { entryDate: c.entryDate ?? CALCULATED_ON, lines: [lineRequest(c)] }, CALCULATED_ON);
  if (!batch.ok) throw new Error(batch.message);
  const result = batch.lines[0];
  if (!estimate.ok) {
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(estimate.error);
    return null;
  }
  if (!result.ok) throw new Error(result.message);
  const e = estimate.estimate;
  const d: SkuDuty = result.duty;
  expect({
    htsCode: d.htsCode,
    matchedTenDigit: d.matchedTenDigit,
    rateColumn: d.rateColumn,
    rateText: d.rateText,
    quantityUsed: d.quantityUsed,
    customsValueUsd: d.customsValueUsd,
    baseDutyUsd: d.baseDutyUsd,
    additionalDutiesUsd: d.additionalDutiesUsd,
    lines: d.lines,
    warnings: d.warnings,
    dutyReviews: d.dutyReviews,
    scheduledChanges: d.scheduledChanges,
    release: d.release,
  }).toEqual({
    htsCode: e.htsCode,
    matchedTenDigit: e.matchedTenDigit,
    rateColumn: e.rateColumn,
    rateText: e.rateText,
    quantityUsed: e.quantityUsed,
    customsValueUsd: e.customsValueUsd,
    baseDutyUsd: e.baseDutyUsd,
    additionalDutiesUsd: e.additionalDutiesUsd,
    lines: e.lines.filter((l) => l.kind !== "fee"),
    warnings: e.warnings.filter(isProgramWarning),
    dutyReviews: e.dutyReviews,
    scheduledChanges: e.scheduledChanges,
    release: e.release,
  });
  expect(d.dutiesUsd).toBe(Math.round((e.baseDutyUsd + e.additionalDutiesUsd) * 100) / 100);
  expect(d.incomplete).toBe(isIncompleteEstimate(e.warnings));
  expect(d.oldestReview).toEqual(oldestReview(e));
  expect(d.effectiveDutyRate).toBe(effectiveRates(e)!.duties);
  return d;
}

// Illustrative rows: China 301 on chapter 64 (listed scope), a 50% row due
// 2026-11-01 (a scheduled change), forced labour (excludes Section 232).
const CHINA_301 = row({ id: "cn301-64", program_key: "section_301_china", hts_scope: "listed", scope: [{ hts_prefix: "6402", article_description: null }] });
const CHINA_301_LATER = row({ id: "cn301-64-later", program_key: "section_301_china", rate_pct: 50, effective_from: "2026-11-01", hts_scope: "listed", scope: [{ hts_prefix: "640299", article_description: null }] });
const CHINA_301_7208 = row({ id: "cn301-72", program_key: "section_301_china", hts_scope: "listed", scope: [{ hts_prefix: "7208", article_description: null }] });
const FORCED_LABOUR = row({
  id: "fl-all", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.31", rate_pct: 12.5, origin_countries: ["CN", "VN"],
  excludes_programs: ["section_232_metals"], exclusion_heading: "9903.05.90",
});

const withRows = (rows: Parameters<typeof dutyRowTables>[0], statuses: unknown[] = []) =>
  dutyTables({ ...dutyRowTables(rows), duty_program_review_status: statuses as Tables[string] });

describe("same answer as the Tariff Calculator", () => {
  test.each([
    ["ad valorem, programs not loaded", { hts: "6402993110", origin: "CN" }],
    ["specific (1.9¢/kg) with the quantity in kg", { hts: "0805100020", origin: "MX", quantity: "1000" }],
    ["compound column 2 rate (RU)", { hts: "7208101500", origin: "RU", quantity: "500" }],
    ["free", { hts: "8471300100", origin: "MX" }],
    ["column 2 ad valorem (RU)", { hts: "6402993110", origin: "RU" }],
    ["an 8-digit code with one 10-digit line", { hts: "84713001", origin: "CN" }],
    ["an 8-digit line of its own", { hts: "08053000", origin: "MX", quantity: "250" }],
  ] as [string, Case][])("%s", async (_name, c) => {
    expect(await expectSameAsCalculator(dutyTables(), c)).not.toBeNull();
  });

  test("a reviewed program with additional duties, a scheduled change and the oldest review", async () => {
    const tables = withRows([CHINA_301, CHINA_301_LATER, FORCED_LABOUR], [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor", "2026-08-01T09:00:00Z")]);
    const d = (await expectSameAsCalculator(tables, { hts: "6402993110", origin: "CN" }))!;
    expect(d.additionalDutiesUsd).toBe(3750);
    expect(d.scheduledChanges.length).toBeGreaterThan(0);
    expect(d.oldestReview?.programName).toBe("Section 301 (forced labour)");
  });

  test("a pending-review program is named, not counted", async () => {
    const tables = withRows([CHINA_301, FORCED_LABOUR], [reviewedStatus("section_301_china")]);
    const d = (await expectSameAsCalculator(tables, { hts: "6402993110", origin: "CN" }))!;
    expect(d.warnings.map((w) => [w.programKey, w.kind])).toContainEqual(["section_301_forced_labor", "pending_review"]);
    expect(d.incomplete).toBe(true);
  });

  test("depends on Section 232 (not loaded): forced labour named, not charged", async () => {
    const tables = withRows([CHINA_301_7208, FORCED_LABOUR], [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")]);
    const d = (await expectSameAsCalculator(tables, { hts: "7208101500", origin: "CN" }))!;
    expect(d.warnings.map((w) => w.kind)).toContain("depends_on");
  });

  test("a conditional row only (condition not assumed): named as conditional, not counted", async () => {
    const conditional = row({
      id: "cn301-cond", program_key: "section_301_china", rate_pct: 100, hts_scope: "listed",
      scope: [{ hts_prefix: "6115", article_description: null }],
      condition_text: "the yarn was spun in a listed facility", assume_condition: false,
    });
    const tables = withRows([conditional], [reviewedStatus("section_301_china")]);
    const d = (await expectSameAsCalculator(tables, { hts: "6115100500", origin: "CN" }))!;
    expect(d.warnings.find((w) => w.programKey === "section_301_china")).toMatchObject({ kind: "conditional", counted: false });
    expect(d.additionalDutiesUsd).toBe(0);
  });

  describe("Section 232 polysilicon on the seeded rows", () => {
    const seeded = [...seedRows("data/tariff/2a-origin-301"), ...seedRows("data/tariff/2b-china301-232")];
    const tables = withRows(seeded, [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")]);
    test.each([
      ["2026-12-03", false],
      ["2026-12-04", true],
    ])("entry %s: named %s", async (entryDate, named) => {
      const d = (await expectSameAsCalculator(tables, { hts: "2804610000", origin: "CN", entryDate }))!;
      expect(d.warnings.some((w) => w.programKey === "section_232_polysilicon")).toBe(named);
    });
  });
});

describe("many lines in one call", () => {
  const tables = withRows([CHINA_301, FORCED_LABOUR], [reviewedStatus("section_301_china"), reviewedStatus("section_301_forced_labor")]);
  const skus: Case[] = [
    { hts: "6402993110", origin: "CN", value: "600.00" },
    { hts: "8471300100", origin: "CN", value: "1500.00" },
    { hts: "0805100020", origin: "CN", value: "900.00", quantity: "120" },
    { hts: "08053000", origin: "CN", value: "300.00", quantity: "80" },
  ];
  const lines = skus.flatMap((c, i) => ["CN", "VN"].map((origin) => lineRequest({ ...c, origin }, `SKU-${i + 1}-${origin}`)));

  test("4 SKUs × 2 origins give the same per-line results as one call per line", async () => {
    const batch = await loadSkuDuties(stubSupabase(tables), { entryDate: CALCULATED_ON, lines }, CALCULATED_ON);
    if (!batch.ok) throw new Error(batch.message);
    expect(batch.lines.map((l) => l.lineId)).toEqual(lines.map((l) => l.lineId));
    for (const [i, line] of lines.entries()) {
      const single = await loadSkuDuties(stubSupabase(tables), { entryDate: CALCULATED_ON, lines: [line] }, CALCULATED_ON);
      expect(single.ok && single.lines[0]).toEqual(batch.lines[i]);
    }
  });

  test("the number of queries doesn't grow with the lines", async () => {
    const one = createSupabaseStub(tables);
    await loadSkuDuties(one.client, { entryDate: CALCULATED_ON, lines: [lines[6]] }, CALCULATED_ON);
    const eight = createSupabaseStub(tables);
    await loadSkuDuties(eight.client, { entryDate: CALCULATED_ON, lines }, CALCULATED_ON);
    // Release, column 2, programs, duties, review status; HTS lines, profiles,
    // chapter 99 changes; scope by prefix and under the 8-digit code.
    expect(one.total()).toBe(10);
    expect(eight.total()).toBe(10);
    expect(Object.fromEntries(eight.counts)).toEqual({
      hts_releases: 1, hts_column2_countries: 1, duty_programs: 1, additional_duties: 1, duty_program_review_status: 1,
      hts_lines: 1, profiles: 1, hts_chapter99_changes: 1, additional_duty_scope: 2,
    });
  });
});

describe("errors on one line leave the others", () => {
  const good = lineRequest({ hts: "6402993110", origin: "CN" }, "good");
  async function run(bad: DutyLineRequest[]) {
    const batch = await loadSkuDuties(stubSupabase(dutyTables()), { entryDate: CALCULATED_ON, lines: [good, ...bad] }, CALCULATED_ON);
    if (!batch.ok) throw new Error(batch.message);
    expect(batch.lines[0].ok).toBe(true);
    return batch.lines.slice(1).map((l) => (l.ok ? "ok" : l.code));
  }

  test.each([
    ["unknown HTS", { hts: "6402993199", origin: "CN" }, "hts_not_found"],
    ["heading without a rate", { hts: "6401100000", origin: "CN" }, "no_rate"],
    ["several 10-digit lines", { hts: "08051000", origin: "CN" }, "hts_ambiguous"],
    ["invalid origin", { hts: "6402993110", origin: "XX" }, "invalid_origin"],
    ["invalid HTS", { hts: "64", origin: "CN" }, "invalid_hts"],
    ["missing quantity for a specific rate", { hts: "0805100020", origin: "CN" }, "needs_quantity"],
    ["quantity in the wrong unit (each, not kg)", { hts: "0805100020", origin: "CN", quantity: "10", unit: "each" }, "needs_quantity"],
  ] as [string, Case, string][])("%s", async (_name, c, code) => {
    expect(await run([lineRequest(c, "bad")])).toEqual([code]);
  });

  test("needs_quantity names the unit", async () => {
    const batch = await loadSkuDuties(stubSupabase(dutyTables()), { entryDate: CALCULATED_ON, lines: [lineRequest({ hts: "0805100020", origin: "CN" })] }, CALCULATED_ON);
    expect(batch.ok && batch.lines[0]).toMatchObject({ code: "needs_quantity", unit: { token: "kg", label: "kg" } });
  });

  test("a duplicated line id fails every line with it", async () => {
    const dup = lineRequest({ hts: "8471300100", origin: "CN" }, "dup");
    expect(await run([dup, dup])).toEqual(["duplicate_line_id", "duplicate_line_id"]);
  });
});

describe("errors for the whole call", () => {
  const line = lineRequest({ hts: "6402993110", origin: "CN" });

  test("no current HTS release", async () => {
    const result = await loadSkuDuties(stubSupabase(dutyTables({ hts_releases: [] })), { entryDate: CALCULATED_ON, lines: [line] }, CALCULATED_ON);
    expect(result).toMatchObject({ ok: false, code: "no_release" });
  });

  test("a database error says nothing about the database", async () => {
    const stub = createSupabaseStub(dutyTables(), { failOn: "additional_duty_scope" });
    const result = await loadSkuDuties(stub.client, { entryDate: CALCULATED_ON, lines: [line] }, CALCULATED_ON);
    expect(result).toEqual({ ok: false, code: "load_failed", message: "Duties couldn't be loaded right now. Try again." });
  });

  test("an entry date out of range", async () => {
    const result = await loadSkuDuties(stubSupabase(dutyTables()), { entryDate: "2026-09-01", lines: [line] }, CALCULATED_ON);
    expect(result).toMatchObject({ ok: false, code: "invalid_entry_date" });
  });

  test("no reads at all when every line is invalid", async () => {
    const stub = createSupabaseStub(dutyTables());
    const result = await loadSkuDuties(stub.client, { entryDate: CALCULATED_ON, lines: [{ ...line, originCountry: "XX" }] }, CALCULATED_ON);
    expect(result.ok && result.lines.map((l) => !l.ok && l.code)).toEqual(["invalid_origin"]);
    expect(stub.total()).toBe(0);
  });
});

describe("line errors read as the calculator's", () => {
  test.each([
    ["unknown HTS", { hts: "6402993199", origin: "CN" }],
    ["heading without a rate", { hts: "6401100000", origin: "CN" }],
    ["several 10-digit lines", { hts: "08051000", origin: "CN" }],
    ["missing quantity", { hts: "0805100020", origin: "CN" }],
  ] as [string, Case][])("%s", async (_name, c) => {
    expect(await expectSameAsCalculator(dutyTables(), c)).toBeNull();
  });
});
