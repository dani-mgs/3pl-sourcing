import type { EstimateLine, FeeCode, FeeRow, ShipmentMode } from "./calculate";
import { pctText, usd, usdText } from "./amount-text";
import { estimateFeeNote, feeYearGap } from "./fee-rollover";
import type { FeesNotEnteredWarning } from "./programs";
import { centsToNumber, compare, div, fromInteger, mul, parseDecimal, toCents, type Rational } from "./rational";

// MPF and HMF on a customs value: the one implementation behind the Tariff
// Calculator (one line, as if it were the whole entry) and Landed Cost (the
// whole entry, on the sum of its lines). Pure: the fee rows in force on the
// entry date are passed in.
//
// The amount is rounded half up to the cent before the MPF minimum and
// maximum are applied.

const HUNDRED = fromInteger(100);

export type FeeCharge = { line: EstimateLine; cents: bigint };

// "auto": informal (flat fee) at or below the informal row's value limit,
// formal above, as the Tariff Calculator does. "formal": the formal rate with
// its minimum and maximum whatever the value (a broker filing a formal entry).
export type EntryTypeChoice = "auto" | "formal";
export type EntryType = "formal" | "informal";

export type MpfCharge = FeeCharge & { entryType: EntryType };

type DatedRow = { effective_from: string | null; effective_to: string | null };

export function inForce(row: DatedRow, date: string): boolean {
  return (row.effective_from == null || row.effective_from <= date) &&
    (row.effective_to == null || row.effective_to >= date);
}

function feeLine(row: FeeRow, cents: bigint, rateText: string, detail: string | null): EstimateLine {
  return {
    kind: "fee",
    code: row.fee_code,
    label: row.label,
    rateText,
    amountUsd: centsToNumber(cents),
    detail,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    effectiveFrom: row.effective_from,
  };
}

// The fee code of the missing row when the MPF can't be worked out.
export function mpfFor(value: Rational, fees: FeeRow[], choice: EntryTypeChoice = "auto"): MpfCharge | FeeCode {
  const informal = choice === "auto" ? fees.find((f) => f.fee_code === "mpf_informal") : undefined;
  if (
    informal &&
    informal.flat_usd != null &&
    informal.applies_up_to_value_usd != null &&
    compare(value, parseDecimal(informal.applies_up_to_value_usd)) <= 0
  ) {
    const cents = toCents(parseDecimal(informal.flat_usd));
    return {
      entryType: "informal",
      cents,
      line: feeLine(
        informal,
        cents,
        `${usdText(informal.flat_usd)} flat`,
        `Assumes an informal entry (value up to ${usdText(informal.applies_up_to_value_usd)})`,
      ),
    };
  }

  const formal = fees.find((f) => f.fee_code === "mpf_formal");
  if (!formal || formal.rate_pct == null || formal.min_usd == null || formal.max_usd == null) {
    return "mpf_formal";
  }
  const rate = parseDecimal(formal.rate_pct);
  const min = toCents(parseDecimal(formal.min_usd));
  const max = toCents(parseDecimal(formal.max_usd));
  const calculated = toCents(div(mul(value, rate), HUNDRED));
  const cents = calculated < min ? min : calculated > max ? max : calculated;
  const limit = cents === min && calculated < min ? "Minimum applied" : cents === max && calculated > max ? "Maximum applied" : null;
  return {
    entryType: "formal",
    cents,
    line: feeLine(
      formal,
      cents,
      `${pctText(rate)} (min ${usdText(formal.min_usd)}, max ${usdText(formal.max_usd)})`,
      [`${pctText(rate)} of ${usd(value)}`, limit].filter(Boolean).join("; "),
    ),
  };
}

// Null when the mode isn't Sea (HMF is for ocean shipments only); the fee code
// when its row is missing.
export function hmfFor(value: Rational, mode: ShipmentMode, fees: FeeRow[]): FeeCharge | FeeCode | null {
  if (mode !== "Sea") return null;
  const row = fees.find((f) => f.fee_code === "hmf");
  if (!row || row.rate_pct == null) return "hmf";
  const rate = parseDecimal(row.rate_pct);
  const cents = toCents(div(mul(value, rate), HUNDRED));
  return { cents, line: feeLine(row, cents, pctText(rate), `${pctText(rate)} of ${usd(value)}`) };
}

// The entry date's fiscal year whose MPF fees aren't entered: last year's are
// used, so the estimate says so.
export function feesNotEnteredWarnings(fees: (FeeRow & DatedRow)[], entryDate: string): FeesNotEnteredWarning[] {
  const gap = feeYearGap(
    fees.map((f) => ({ fee_code: f.fee_code, effective_from: f.effective_from, effective_to: f.effective_to })),
    entryDate,
  );
  if (!gap) return [];
  return [{ kind: "fees_not_entered", text: estimateFeeNote(gap), fiscalYear: gap.fiscalYear, startsOn: gap.startsOn, counted: false }];
}
