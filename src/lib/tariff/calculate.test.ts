import { describe, expect, test } from "vitest";
import { calculateEstimate, customsValueInUsd, type EstimateInput, type FeeRow } from "./calculate";
import { parseDecimal } from "./rational";

// Golden cases, worked by hand. Rate texts are as published in the 2026 HTS,
// Revision 20 (USITC, in effect from 2026-09-28), checked 2026-10-02 against
// the HTS REST API. Fees are the FY2027 rows seeded in
// 20261002135139_tariff_fees_and_programs.sql: MPF 0.3464% (min $34.58,
// max $670.86; Federal Register 2026-15530), informal MPF $2.77 up to $2,500,
// HMF 0.125% (19 CFR 24.24). Each line rounds once, half-up to the cent.

const FR = "https://www.federalregister.gov/documents/2026/07/31/2026-15530/customs-user-fees-to-be-adjusted-for-inflation-in-fiscal-year-2027";
const FEES: FeeRow[] = [
  {
    fee_code: "mpf_formal",
    label: "Merchandise Processing Fee (formal entry)",
    rate_pct: 0.3464,
    min_usd: 34.58,
    max_usd: 670.86,
    flat_usd: null,
    applies_up_to_value_usd: null,
    effective_from: "2026-10-01",
    source_label: "Federal Register 2026-15530",
    source_url: FR,
  },
  {
    fee_code: "mpf_informal",
    label: "Merchandise Processing Fee (informal entry, automated)",
    rate_pct: null,
    min_usd: null,
    max_usd: null,
    flat_usd: 2.77,
    applies_up_to_value_usd: 2500,
    effective_from: "2026-10-01",
    source_label: "Federal Register 2026-15530",
    source_url: FR,
  },
  {
    fee_code: "hmf",
    label: "Harbor Maintenance Fee",
    rate_pct: 0.125,
    min_usd: null,
    max_usd: null,
    flat_usd: null,
    applies_up_to_value_usd: null,
    effective_from: "1991-01-01",
    source_label: "19 CFR 24.24",
    source_url: "https://www.ecfr.gov/current/title-19/section-24.24",
  },
];

const RELEASE = { name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28" };

function input(overrides: Partial<EstimateInput> & { line: EstimateInput["line"] }): EstimateInput {
  return {
    release: RELEASE,
    originIsColumn2: false,
    shipmentMode: "Sea",
    customsValueUsd: parseDecimal("10000"),
    quantity: null,
    fees: FEES,
    ...overrides,
  };
}

const FOOTWEAR = { hts_code: "6402993110", general_rate: "6%", special_rate: "Free (AU,BH, CL,CO,D,E,IL, JO,KR,MA, OM,P,PA,PE, R,S,SG)", other_rate: "35%" };
const ORANGES = { hts_code: "0805100020", general_rate: "1.9¢/kg", special_rate: "Free (AU,BH, CL,CO,D,E,IL, JO,KR,MA, OM,P,PA,PE,S,SG)", other_rate: "2.2¢/kg" };
const STEEL = { hts_code: "7208101500", general_rate: "Free", special_rate: null, other_rate: "0.4¢/kg + 20%" };

function amounts(result: ReturnType<typeof calculateEstimate>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return {
    base: result.baseDutyUsd,
    lines: Object.fromEntries(result.lines.map((l) => [l.code, l.amountUsd])),
    fees: result.feesUsd,
    total: result.totalUsd,
  };
}

describe("golden: base duty + MPF + HMF", () => {
  test("ad valorem: 6402.99.31.10 at 6%, $10,000, ocean", () => {
    // 6% × 10,000 = 600.00; MPF 0.3464% × 10,000 = 34.64 (above the 34.58
    // minimum); HMF 0.125% × 10,000 = 12.50. Total 647.14.
    expect(amounts(calculateEstimate(input({ line: FOOTWEAR })))).toEqual({
      base: 600,
      lines: { general: 600, mpf_formal: 34.64, hmf: 12.5 },
      fees: 47.14,
      total: 647.14,
    });
  });

  test("specific: 0805.10.00.20 at 1.9¢/kg, 20,000 kg, $10,000, ocean", () => {
    // 20,000 kg × 1.9¢ = 38,000¢ = 380.00 (3.80% of value); MPF 34.64; HMF
    // 12.50. Total 427.14.
    const result = calculateEstimate(input({ line: ORANGES, quantity: parseDecimal("20000") }));
    expect(amounts(result)).toEqual({
      base: 380,
      lines: { general: 380, mpf_formal: 34.64, hmf: 12.5 },
      fees: 47.14,
      total: 427.14,
    });
    expect(result.ok && result.quantityUsed).toEqual({ value: 20000, unit: "kg", unitLabel: "kg" });
    expect(result.ok && result.lines[0].detail).toBe("20,000 kg; about 3.8% of the customs value");
  });

  test("compound, column 2: 7208.10.15.00 for a column 2 origin, 5,000 kg, $10,000, ocean", () => {
    // Column 2 rate 0.4¢/kg + 20%: 5,000 × 0.4¢ = 20.00, plus 20% × 10,000 =
    // 2,000.00, so 2,020.00; MPF 34.64; HMF 12.50. Total 2,067.14.
    const result = calculateEstimate(
      input({ line: STEEL, originIsColumn2: true, quantity: parseDecimal("5000") }),
    );
    expect(amounts(result)).toEqual({
      base: 2020,
      lines: { column2: 2020, mpf_formal: 34.64, hmf: 12.5 },
      fees: 47.14,
      total: 2067.14,
    });
    expect(result.ok && result.rateColumn).toBe("column2");
    expect(result.ok && result.rateText).toBe("0.4¢/kg + 20%");
  });

  test("free, by air: 7208.10.15.00 general rate Free, $10,000 — no HMF", () => {
    // Free = 0.00; MPF 34.64; no HMF by air. Total 34.64.
    expect(amounts(calculateEstimate(input({ line: STEEL, shipmentMode: "Air" })))).toEqual({
      base: 0,
      lines: { general: 0, mpf_formal: 34.64 },
      fees: 34.64,
      total: 34.64,
    });
  });
});

describe("MPF limits and informal entries", () => {
  test("minimum applies below about $9,983", () => {
    // 0.3464% × 5,000 = 17.32 → minimum 34.58.
    const result = calculateEstimate(input({ line: FOOTWEAR, customsValueUsd: parseDecimal("5000"), shipmentMode: "Air" }));
    expect(amounts(result).lines.mpf_formal).toBe(34.58);
    expect(result.ok && result.lines[1].detail).toContain("Minimum applied");
  });

  test("maximum applies above about $193,666", () => {
    // 0.3464% × 500,000 = 1,732.00 → maximum 670.86. HMF 0.125% = 625.00.
    const result = calculateEstimate(input({ line: FOOTWEAR, customsValueUsd: parseDecimal("500000") }));
    expect(amounts(result).lines).toEqual({ general: 30000, mpf_formal: 670.86, hmf: 625 });
    expect(result.ok && result.lines[1].detail).toContain("Maximum applied");
  });

  test("up to $2,500 is treated as an informal entry with the flat fee", () => {
    for (const value of ["2000", "2500", "2500.00"]) {
      const result = calculateEstimate(input({ line: FOOTWEAR, customsValueUsd: parseDecimal(value), shipmentMode: "Air" }));
      expect(amounts(result).lines).toMatchObject({ mpf_informal: 2.77 });
    }
    const formal = calculateEstimate(input({ line: FOOTWEAR, customsValueUsd: parseDecimal("2500.01"), shipmentMode: "Air" }));
    expect(amounts(formal).lines).toMatchObject({ mpf_formal: 34.58 });
  });
});

describe("rounding", () => {
  test("each line rounds once, half up", () => {
    // 6% × 10,001.25 = 600.075 → 600.08; MPF 0.3464% × 10,001.25 =
    // 34.644330 → 34.64; HMF 0.125% × 10,001.25 = 12.5015625 → 12.50.
    expect(amounts(calculateEstimate(input({ line: FOOTWEAR, customsValueUsd: parseDecimal("10001.25") }))).lines).toEqual({
      general: 600.08,
      mpf_formal: 34.64,
      hmf: 12.5,
    });
  });

  test("fractional rates stay exact (33 1/3% of $10,000)", () => {
    const line = { hts_code: "1234567890", general_rate: "33 1/3%", special_rate: null, other_rate: null };
    expect(amounts(calculateEstimate(input({ line, shipmentMode: "Air" }))).base).toBe(3333.33);
  });

  test("customs value converts and rounds to the cent", () => {
    // 10,000 EUR × 1.0812345678 = 10,812.345678 → 10,812.35.
    expect(customsValueInUsd("10000", "1.0812345678")).toEqual(parseDecimal("10812.35"));
  });
});

describe("estimates that can't be completed", () => {
  test("a per-unit rate without a quantity asks for it in the rate's unit", () => {
    expect(calculateEstimate(input({ line: ORANGES }))).toEqual({
      ok: false,
      reason: "quantity_required",
      unitLabel: "kg",
    });
  });

  test("a quantity is ignored for a purely ad valorem rate", () => {
    const result = calculateEstimate(input({ line: FOOTWEAR, quantity: parseDecimal("100") }));
    expect(result.ok && result.quantityUsed).toBeNull();
  });

  test("a rate with qualifiers is not guessed", () => {
    const line = { hts_code: "2008302000", general_rate: "5.1¢/kg on drained weight", special_rate: null, other_rate: null };
    expect(calculateEstimate(input({ line }))).toEqual({
      ok: false,
      reason: "unsupported_rate",
      rateText: "5.1¢/kg on drained weight",
    });
  });

  test("a line with no rate", () => {
    const line = { hts_code: "7208", general_rate: null, special_rate: null, other_rate: null };
    expect(calculateEstimate(input({ line }))).toEqual({ ok: false, reason: "no_rate" });
  });

  test("missing fee data stops the estimate instead of counting zero", () => {
    expect(calculateEstimate(input({ line: FOOTWEAR, fees: FEES.filter((f) => f.fee_code !== "mpf_formal") }))).toEqual({
      ok: false,
      reason: "missing_fee",
      feeCode: "mpf_formal",
    });
    expect(calculateEstimate(input({ line: FOOTWEAR, fees: FEES.filter((f) => f.fee_code !== "hmf") }))).toEqual({
      ok: false,
      reason: "missing_fee",
      feeCode: "hmf",
    });
    // HMF isn't needed by air, so its absence doesn't matter there.
    expect(calculateEstimate(input({ line: FOOTWEAR, shipmentMode: "Air", fees: FEES.filter((f) => f.fee_code !== "hmf") })).ok).toBe(true);
  });
});

describe("sources on every line", () => {
  test("base duty cites the HTS release; fees cite their rows", () => {
    const result = calculateEstimate(input({ line: FOOTWEAR }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.lines.map((l) => [l.code, l.sourceLabel, l.effectiveFrom])).toEqual([
      ["general", "HTSUS Revision 20 (2026) (USITC)", "2026-09-28"],
      ["mpf_formal", "Federal Register 2026-15530", "2026-10-01"],
      ["hmf", "19 CFR 24.24", "1991-01-01"],
    ]);
    expect(result.lines[1].rateText).toBe("0.3464% (min $34.58, max $670.86)");
  });
});
