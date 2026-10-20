import { describe, expect, test } from "vitest";
import type { FeeRow } from "./calculate";
import { hmfFor, mpfFor } from "./customs-fees";
import { parseDecimal } from "./rational";

// The shared MPF/HMF implementation. calculate.test.ts and spec-cases.test.ts
// cover the Tariff Calculator's results through calculateEstimate; this adds
// the entry-type choice Landed Cost uses.

const SOURCE = { source_label: "Federal Register 2026-15530", source_url: "https://www.federalregister.gov/" };
const FEES: FeeRow[] = [
  { fee_code: "mpf_formal", label: "MPF (formal)", rate_pct: "0.3464", min_usd: "34.58", max_usd: "670.86", flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", ...SOURCE },
  { fee_code: "mpf_informal", label: "MPF (informal)", rate_pct: null, min_usd: null, max_usd: null, flat_usd: "2.77", applies_up_to_value_usd: "2500.00", effective_from: "2026-10-01", ...SOURCE },
  { fee_code: "hmf", label: "HMF", rate_pct: "0.125", min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", ...SOURCE },
];

describe("mpfFor", () => {
  test("auto (the default): informal at or below the limit, formal above", () => {
    expect(mpfFor(parseDecimal("2500.00"), FEES)).toMatchObject({ entryType: "informal", cents: BigInt(277) });
    expect(mpfFor(parseDecimal("2500.01"), FEES)).toMatchObject({ entryType: "formal", cents: BigInt(3458) });
  });

  test("formal: the formal rate and minimum, even below the informal limit", () => {
    const charge = mpfFor(parseDecimal("600.00"), FEES, "formal");
    expect(charge).toMatchObject({ entryType: "formal", cents: BigInt(3458) });
    expect(typeof charge !== "string" && charge.line.detail).toBe("0.3464% of $600.00; Minimum applied");
  });

  test("formal with no formal row names the missing fee, even with an informal row", () => {
    expect(mpfFor(parseDecimal("600.00"), FEES.filter((f) => f.fee_code !== "mpf_formal"), "formal")).toBe("mpf_formal");
  });

  test("auto with no informal row uses the formal rate", () => {
    expect(mpfFor(parseDecimal("600.00"), FEES.filter((f) => f.fee_code !== "mpf_informal"))).toMatchObject({ entryType: "formal" });
  });
});

describe("hmfFor", () => {
  test("ocean only", () => {
    expect(hmfFor(parseDecimal("600.00"), "Sea", FEES)).toMatchObject({ cents: BigInt(75) });
    expect(hmfFor(parseDecimal("600.00"), "Air", FEES)).toBeNull();
    expect(hmfFor(parseDecimal("600.00"), "Sea", [])).toBe("hmf");
  });
});
