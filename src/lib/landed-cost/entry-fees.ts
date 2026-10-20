import type { EstimateLine, FeeCode, FeeRow, ShipmentMode } from "@/lib/tariff/calculate";
import {
  feesNotEnteredWarnings,
  hmfFor,
  inForce,
  mpfFor,
  type EntryType,
  type EntryTypeChoice,
  type FeeCharge,
  type MpfCharge,
} from "@/lib/tariff/customs-fees";
import type { FeesNotEnteredWarning } from "@/lib/tariff/programs";
import { centsToRational, fromInteger } from "@/lib/tariff/rational";
import { allocateCents } from "./allocation";

// MPF and HMF for one customs entry (one origin scenario): worked out once on
// the sum of the SKUs' entered values, with the Tariff Calculator's fee rules
// (customs-fees.ts), then split across the SKUs by entered value. Pure.

export type FeeRowWithDates = FeeRow & { effective_to: string | null };

export type EntryFeesInput = {
  // Each SKU's entered value in cents (USD), in line order.
  enteredValuesCents: bigint[];
  shipmentMode: ShipmentMode;
  // Every fee row; only those in force on the entry date are used.
  feeRows: FeeRowWithDates[];
  entryDate: string;
  entryTypeChoice: EntryTypeChoice;
};

export type EntryFees = {
  enteredValueCents: bigint;
  entryType: EntryType;
  // "chosen" when the scenario asked for a formal entry, "automatic" when
  // the value decided it.
  entryTypeSource: "chosen" | "automatic";
  mpf: MpfCharge;
  hmf: FeeCharge | null;
  mpfShares: bigint[];
  hmfShares: bigint[];
  // MPF, then HMF when it applies.
  lines: EstimateLine[];
  // The entry date's fiscal-year fees aren't entered (last year's are used).
  warnings: FeesNotEnteredWarning[];
};

export type EntryFeesResult =
  | { ok: true; fees: EntryFees }
  | { ok: false; error: string; missingFee?: FeeCode };

const B0 = BigInt(0);

export function computeEntryFees(input: EntryFeesInput): EntryFeesResult {
  const values = input.enteredValuesCents;
  if (values.length === 0) return { ok: false, error: "The entry has no SKUs." };
  if (values.some((v) => v < B0)) return { ok: false, error: "An entered value can't be negative." };
  const total = values.reduce((acc, v) => acc + v, B0);
  if (total === B0) return { ok: false, error: "The entry's total entered value is zero." };

  const inForceRows = input.feeRows.filter((f) => inForce(f, input.entryDate));
  const totalUsd = centsToRational(total);
  const mpf = mpfFor(totalUsd, inForceRows, input.entryTypeChoice);
  if (typeof mpf === "string") return missing(mpf, input.entryDate);
  const hmf = hmfFor(totalUsd, input.shipmentMode, inForceRows);
  if (typeof hmf === "string") return missing(hmf, input.entryDate);

  const weights = values.map((v) => fromInteger(v));
  const mpfShares = allocateCents(mpf.cents, weights);
  const hmfShares = allocateCents(hmf?.cents ?? B0, weights);
  // Can't fail: the weights are non-negative with a positive sum.
  if (!mpfShares.ok || !hmfShares.ok) return { ok: false, error: "The fees couldn't be split across the SKUs." };

  return {
    ok: true,
    fees: {
      enteredValueCents: total,
      entryType: mpf.entryType,
      entryTypeSource: input.entryTypeChoice === "formal" ? "chosen" : "automatic",
      mpf,
      hmf,
      mpfShares: mpfShares.parts,
      hmfShares: hmfShares.parts,
      lines: [mpf.line, ...(hmf ? [hmf.line] : [])],
      warnings: feesNotEnteredWarnings(input.feeRows, input.entryDate),
    },
  };
}

function missing(feeCode: FeeCode, entryDate: string): EntryFeesResult {
  const what = feeCode === "hmf" ? "Harbor Maintenance Fee" : "Merchandise Processing Fee";
  return { ok: false, missingFee: feeCode, error: `The ${what} rate for ${entryDate} isn't set up yet. Ask an admin to add it.` };
}
