import { describe, expect, test } from "vitest";
import golden from "./__fixtures__/landed-cost.golden.json";
import { computeEntryFees, type EntryFeesInput, type FeeRowWithDates } from "./entry-fees";

const FEE_ROWS = golden.feeRows as unknown as FeeRowWithDates[];
const ENTRY = "2026-10-04";

function fees(overrides: Partial<EntryFeesInput>) {
  const result = computeEntryFees({
    enteredValuesCents: [BigInt(60000)],
    shipmentMode: "Sea",
    feeRows: FEE_ROWS,
    entryDate: ENTRY,
    entryTypeChoice: "auto",
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result.fees;
}

const cents = (...values: number[]) => values.map((v) => BigInt(v));

describe("entry type", () => {
  test("auto: at or below $2,500.00 is informal with the flat fee", () => {
    const f = fees({ enteredValuesCents: cents(250000) });
    expect([f.entryType, f.entryTypeSource, Number(f.mpf.cents)]).toEqual(["informal", "automatic", 277]);
  });

  test("auto: $2,500.01 is formal (minimum applies)", () => {
    const f = fees({ enteredValuesCents: cents(250001) });
    expect([f.entryType, f.entryTypeSource, Number(f.mpf.cents)]).toEqual(["formal", "automatic", 3458]);
    expect(f.mpf.line.detail).toContain("Minimum applied");
  });

  test("auto decides on the TOTAL entered value: two $1,500.00 SKUs make one formal entry", () => {
    const f = fees({ enteredValuesCents: cents(150000, 150000) });
    expect(f.entryType).toBe("formal");
    expect(f.mpf.cents).toBe(BigInt(3458));
    expect(f.mpfShares).toEqual(cents(1729, 1729));
    expect(f.lines.filter((l) => l.code.startsWith("mpf"))).toHaveLength(1);
  });

  test("formal: the formal rate with its minimum even at or below $2,500.00", () => {
    const f = fees({ enteredValuesCents: cents(60000), entryTypeChoice: "formal" });
    expect([f.entryType, f.entryTypeSource, Number(f.mpf.cents)]).toEqual(["formal", "chosen", 3458]);
  });

  test("the maximum applies on a large entry", () => {
    const f = fees({ enteredValuesCents: cents(30000000) });
    expect(f.mpf.cents).toBe(BigInt(67086));
    expect(f.mpf.line.detail).toContain("Maximum applied");
  });
});

describe("HMF", () => {
  test("Sea: 0.125% of the entry's value, split by value", () => {
    const f = fees({ enteredValuesCents: cents(150000, 150000) });
    expect(f.hmf!.cents).toBe(BigInt(375));
    expect(f.hmfShares).toEqual(cents(188, 187));
  });

  test.each(["Air", "Road"] as const)("%s: no HMF", (mode) => {
    const f = fees({ shipmentMode: mode });
    expect(f.hmf).toBeNull();
    expect(f.hmfShares).toEqual(cents(0));
    expect(f.lines.map((l) => l.code)).toEqual(["mpf_informal"]);
  });
});

describe("splitting by entered value", () => {
  test("shares follow value and add up exactly", () => {
    const f = fees({ enteredValuesCents: cents(100000, 200000, 300000), entryTypeChoice: "formal" });
    // 0.3464% of 6,000.00 = 20.78, below the minimum: 34.58 split 1:2:3.
    expect(f.mpfShares).toEqual(cents(576, 1153, 1729));
    expect(f.mpfShares.reduce((a, b) => a + b)).toBe(f.mpf.cents);
  });

  test("a zero-value SKU gets no fee", () => {
    expect(fees({ enteredValuesCents: cents(0, 60000) }).mpfShares).toEqual(cents(0, 277));
  });
});

describe("errors and warnings", () => {
  test("a missing fee row names the fee", () => {
    const result = computeEntryFees({
      enteredValuesCents: cents(300000),
      shipmentMode: "Sea",
      feeRows: FEE_ROWS.filter((f) => f.fee_code !== "hmf"),
      entryDate: ENTRY,
      entryTypeChoice: "auto",
    });
    expect(result).toMatchObject({ ok: false, missingFee: "hmf" });
  });

  test("fee rows not in force on the entry date aren't used", () => {
    const result = computeEntryFees({
      enteredValuesCents: cents(300000),
      shipmentMode: "Air",
      feeRows: FEE_ROWS,
      entryDate: "2026-09-30",
      entryTypeChoice: "auto",
    });
    expect(result).toMatchObject({ ok: false, missingFee: "mpf_formal" });
  });

  test("no SKUs, a zero total or a negative value is an error", () => {
    const base = { shipmentMode: "Sea" as const, feeRows: FEE_ROWS, entryDate: ENTRY, entryTypeChoice: "auto" as const };
    expect(computeEntryFees({ ...base, enteredValuesCents: [] }).ok).toBe(false);
    expect(computeEntryFees({ ...base, enteredValuesCents: cents(0, 0) }).ok).toBe(false);
    expect(computeEntryFees({ ...base, enteredValuesCents: cents(-1, 100) }).ok).toBe(false);
  });

  test("fees of the entry's fiscal year not entered: last year's are used, with the warning", () => {
    // FY2028 starts 2027-10-01 and has no rows; FY2027's have no end date.
    const f = fees({ entryDate: "2027-10-15" });
    expect(f.mpf.cents).toBe(BigInt(277));
    expect(f.warnings).toHaveLength(1);
    expect(f.warnings[0]).toMatchObject({ kind: "fees_not_entered", fiscalYear: 2028, counted: false });
  });

  test("no warning when the fiscal year's fees are entered", () => {
    expect(fees({}).warnings).toEqual([]);
  });
});
