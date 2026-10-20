import { ZERO, add, compare, div, fromInteger, mul, type Rational } from "@/lib/tariff/rational";

// Splits a whole-cent amount across lines in proportion to their weights
// (chargeable kg, entered value, units) so the parts add up to the amount
// exactly: largest remainder. Every line gets the whole cents of its exact
// share; the cents left over go one each to the lines with the largest
// fractional remainders, earlier lines first on a tie. Pure and exact.

export type AllocationResult = { ok: true; parts: bigint[] } | { ok: false; error: string };

const B0 = BigInt(0);
const B1 = BigInt(1);

export const NO_LINES = "There are no lines to split the amount across.";
export const ALL_WEIGHTS_ZERO = "Every line has a zero weight, so the amount can't be split. Check the lines.";

export function allocateCents(totalCents: bigint, weights: Rational[]): AllocationResult {
  if (weights.length === 0) return { ok: false, error: NO_LINES };
  if (totalCents < B0) return { ok: false, error: "The amount to split can't be negative." };
  if (weights.some((w) => compare(w, ZERO) < 0)) return { ok: false, error: "A line's weight can't be negative." };
  const sum = weights.reduce((acc, w) => add(acc, w), ZERO);
  if (compare(sum, ZERO) === 0) return { ok: false, error: ALL_WEIGHTS_ZERO };

  const total = fromInteger(totalCents);
  const shares = weights.map((w, index) => {
    const exact = div(mul(total, w), sum);
    // Non-negative, so bigint division is the floor.
    const whole = exact.n / exact.d;
    return { index, whole, remainder: { n: exact.n - whole * exact.d, d: exact.d } };
  });

  const parts = shares.map((s) => s.whole);
  let left = totalCents - parts.reduce((acc, p) => acc + p, B0);
  const order = [...shares].sort((a, b) => compare(b.remainder, a.remainder) || a.index - b.index);
  for (const share of order) {
    if (left === B0) break;
    parts[share.index] += B1;
    left -= B1;
  }
  return { ok: true, parts };
}
