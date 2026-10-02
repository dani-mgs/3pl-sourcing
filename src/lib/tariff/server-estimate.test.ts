import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildEstimate, estimateToRow, inForce } from "./server-estimate";
import type { EstimateFormData } from "./parse-estimate-form";

// A stub of the Supabase query chains buildEstimate uses, answering from
// in-memory tables and applying eq/like filters.
type Row = Record<string, unknown>;

function stubSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let max = Infinity;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((r) => r[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[column]));
          return chain;
        },
        gt: (column: string, value: string) => {
          filters.push((r) => String(r[column]) > value);
          return chain;
        },
        like: (column: string, pattern: string) => {
          const regex = new RegExp(`^${pattern.replace(/%/g, ".*").replace(/_/g, ".")}$`);
          filters.push((r) => regex.test(String(r[column])));
          return chain;
        },
        limit: (n: number) => {
          max = n;
          return chain;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  } as never;
}

const RELEASE = { id: "rel-20", name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28", status: "current" };
const line = (code: string, general: string | null, other: string | null = "35%") => ({
  release_id: "rel-20",
  hts_code: code,
  description: `Line ${code}`,
  ancestor_descriptions: ["Heading"],
  units: ["kg"],
  general_rate: general,
  special_rate: null,
  other_rate: other,
});

const FEES = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", effective_to: null, source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  // Last year's limits, no longer in force.
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 33.58, max_usd: 651.5, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2025-10-01", effective_to: "2026-09-30", source_label: "FY2026", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", effective_to: null, source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", effective_to: null, source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];

const PROGRAMS = [
  { key: "section_301_forced_labor", name: "Section 301 (forced labour)", status: "not_loaded", warning_text: "May apply.", trigger_origins: ["CN", "VN"], trigger_hts_prefixes: null, indicative_rates: { CN: 12.5, VN: 12.5 }, source_label: "FR", source_url: "https://www.federalregister.gov/", sort_order: 10 },
  { key: "section_301_china", name: "Section 301 (China)", status: "not_loaded", warning_text: "May apply.", trigger_origins: ["CN"], trigger_hts_prefixes: null, indicative_rates: null, source_label: "CBP", source_url: "https://www.cbp.gov/", sort_order: 20 },
];

function tables(extra: Partial<Record<string, Row[]>> = {}) {
  return {
    hts_releases: [RELEASE],
    hts_lines: [
      line("6402993110", "6%"),
      line("7208101500", "Free", "0.4¢/kg + 20%"),
      line("8471300100", "Free"),
      line("0805100020", "1.9¢/kg"),
      line("0805100050", "1.9¢/kg"),
    ],
    customs_fees: FEES,
    hts_column2_countries: [{ country_code: "RU", effective_from: "2022-04-09", effective_to: null }],
    duty_programs: PROGRAMS,
    fx_rates: [{ currency: "EUR", rate_date: "2026-10-01", rate_to_usd: "1.08" }],
    additional_duties: [],
    additional_duty_scope: [],
    duty_program_review_status: [],
    hts_chapter99_changes: [],
    profiles: [],
    ...extra,
  } as Record<string, Row[]>;
}

const input = (overrides: Partial<EstimateFormData> = {}): EstimateFormData => ({
  htsDigits: "6402993110",
  originCountry: "CN",
  shipmentMode: "Sea",
  customsValue: "10000",
  currency: "USD",
  exchangeRate: "1",
  exchangeRateSource: null,
  exchangeRateDate: null,
  quantity: null,
  label: null,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("buildEstimate", () => {
  test("uses the fees in force today and lists matching program warnings", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input());
    if (!result.ok) throw new Error(result.error);
    expect(result.estimate).toMatchObject({
      asOfDate: "2026-10-02",
      htsCode: "6402993110",
      rateColumn: "general",
      baseDutyUsd: 600,
      feesUsd: 47.14,
      totalUsd: 647.14,
      release: { name: "2026HTSRev20", release_start_date: "2026-09-28" },
    });
    expect(result.estimate.lines[1]).toMatchObject({ code: "mpf_formal", rateText: "0.3464% (min $34.58, max $670.86)" });
    expect(result.estimate.warnings.map((w) => [w.programKey, w.kind, w.indicativePct])).toEqual([
      ["section_301_forced_labor", "not_loaded", 12.5],
      ["section_301_china", "not_loaded", null],
    ]);
    expect(result.estimate.additionalDutiesUsd).toBe(0);
  });

  test("reviewed duties in force are added to the total, with who reviewed them", async () => {
    const duty = {
      id: "d1", program_key: "section_301_forced_labor", chapter99_heading: "9903.05.84", chapter99_heading_at_minimum: null,
      label: "Vietnam", rate_type: "add", rate_pct: 12.5, origin_countries: ["VN"], hts_scope: "all", condition_text: null,
      excludes_programs: ["section_232_metals"], exclusion_heading: "9903.05.90", filing_order: 10,
      effective_from: "2026-07-24", effective_to: null, legal_status: "in_force_under_litigation",
      source_label: "FR 2026-15181", source_url: "https://www.federalregister.gov/", source_checked_on: "2026-10-02",
    };
    const ended = { ...duty, id: "d0", chapter99_heading: "9903.05.99", rate_pct: 50, effective_to: "2026-09-30" };
    const result = await buildEstimate(
      stubSupabase(
        tables({
          additional_duties: [duty, ended],
          duty_program_review_status: [
            { program_key: "section_301_forced_labor", review_status: "reviewed", last_reviewed_at: "2026-10-01T10:00:00Z", last_reviewed_by: "u1" },
          ],
          profiles: [{ id: "u1", email: "dani@test.local", first_name: "Dani" }],
          hts_chapter99_changes: [{ hts_code: "99030584", detected_at: "2026-10-01T12:00:00Z" }],
        }),
      ),
      input({ originCountry: "VN" }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.estimate).toMatchObject({ baseDutyUsd: 600, additionalDutiesUsd: 1250, totalUsd: 1897.14 });
    expect(result.estimate.lines.map((l) => [l.kind, l.code, l.amountUsd])).toEqual([
      ["duty", "general", 600],
      ["additional", "section_301_forced_labor", 1250],
      ["fee", "mpf_formal", 34.64],
      ["fee", "hmf", 12.5],
    ]);
    expect(result.estimate.lines[1]).toMatchObject({ legalStatus: "In force — under litigation", heading: "9903.05.84" });
    expect(result.estimate.dutyReviews).toEqual([
      expect.objectContaining({
        reviewedByName: "Dani",
        staleReason: "1 Chapter 99 heading changed in the HTS since",
      }),
    ]);
    expect(estimateToRow(result.estimate, null)).toMatchObject({ additional_duties_usd: 1250, total_usd: 1897.14 });
  });

  test("a column 2 origin uses the column 2 rate", async () => {
    const result = await buildEstimate(
      stubSupabase(tables()),
      input({ htsDigits: "7208101500", originCountry: "RU", quantity: "5000" }),
    );
    expect(result.ok && result.estimate).toMatchObject({ rateColumn: "column2", rateText: "0.4¢/kg + 20%", baseDutyUsd: 2020 });
  });

  test("an 8-digit code matches its only 10-digit line", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input({ htsDigits: "84713001" }));
    expect(result.ok && result.estimate).toMatchObject({ htsCode: "8471300100", matchedTenDigit: true });
  });

  test("an 8-digit code with several statistical lines asks for 10 digits", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input({ htsDigits: "08051000" }));
    expect(result).toEqual({
      ok: false,
      error: "0805.10.00 has several 10-digit statistical lines. Enter the full 10-digit code.",
    });
  });

  test("an unknown code names the release it checked", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input({ htsDigits: "1234567890" }));
    expect(result).toEqual({
      ok: false,
      error: "1234.56.78.90 isn't in the current HTS (Revision 20 (2026)). Check the code.",
    });
  });

  test("no current release yet", async () => {
    const result = await buildEstimate(stubSupabase(tables({ hts_releases: [] })), input());
    expect(result).toEqual({ ok: false, error: "HTS data hasn't been imported yet. Try again later." });
  });

  test("a per-unit rate without quantity explains which unit", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input({ htsDigits: "0805100020" }));
    expect(result).toEqual({
      ok: false,
      error: "The rate for 0805.10.00.20 is charged per unit. Enter the quantity in kg.",
    });
  });

  test("missing fee rows stop the estimate with a clear message", async () => {
    const result = await buildEstimate(stubSupabase(tables({ customs_fees: [] })), input());
    expect(result).toEqual({
      ok: false,
      error: "Fee rates for today aren't set up yet, so the estimate can't be completed. Ask an admin to add them.",
    });
  });

  test("a daily-feed rate that matches the stored rate keeps its provenance", async () => {
    const result = await buildEstimate(
      stubSupabase(tables()),
      input({ currency: "EUR", exchangeRate: "1.08", exchangeRateSource: "daily_feed", exchangeRateDate: "2026-10-01" }),
    );
    expect(result.ok && result.estimate).toMatchObject({
      exchangeRateSource: "daily_feed",
      exchangeRateDate: "2026-10-01",
      customsValueUsd: 10800,
      baseDutyUsd: 648,
    });
  });

  test("a claimed daily-feed rate that doesn't match is saved as manual, dated today", async () => {
    const result = await buildEstimate(
      stubSupabase(tables()),
      input({ currency: "EUR", exchangeRate: "1.5", exchangeRateSource: "daily_feed", exchangeRateDate: "2026-10-01" }),
    );
    expect(result.ok && result.estimate).toMatchObject({ exchangeRateSource: "manual", exchangeRateDate: "2026-10-02" });
  });

  test("database errors return the generic message", async () => {
    const failing = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: { message: "relation does not exist" } }),
        };
        return chain;
      },
    } as never;
    expect(await buildEstimate(failing, input())).toEqual({ ok: false, error: "An unexpected error occurred." });
  });
});

describe("estimateToRow", () => {
  test("carries the locked snapshot fields", async () => {
    const result = await buildEstimate(stubSupabase(tables()), input({ htsDigits: "0805100020", quantity: "20000" }));
    if (!result.ok) throw new Error(result.error);
    const row = estimateToRow(result.estimate, "Client A");
    expect(row).toMatchObject({
      label: "Client A",
      hts_code: "0805100020",
      hts_release_name: "2026HTSRev20",
      rate_text: "1.9¢/kg",
      quantity: 20000,
      quantity_unit: "kg",
      base_duty_usd: 380,
      total_usd: 427.14,
      exchange_rate_source: null,
    });
    expect(row.total_usd).toBe(row.base_duty_usd + row.additional_duties_usd + row.fees_usd);
  });
});

describe("inForce", () => {
  test("open-ended and dated ranges", () => {
    expect(inForce({ effective_from: "2026-10-01", effective_to: null }, "2026-10-02")).toBe(true);
    expect(inForce({ effective_from: "2026-10-03", effective_to: null }, "2026-10-02")).toBe(false);
    expect(inForce({ effective_from: "2025-10-01", effective_to: "2026-09-30" }, "2026-10-02")).toBe(false);
    expect(inForce({ effective_from: null, effective_to: null }, "2026-10-02")).toBe(true);
  });
});
