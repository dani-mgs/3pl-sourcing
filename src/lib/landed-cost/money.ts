import { div, fromInteger, parseDecimal, toCents, type Rational } from "@/lib/tariff/rational";

// Reading typed amounts exactly (no floats) and the few rounded figures
// Landed Cost shows. Amounts are rounded to the cent only here, at the edges.

const B0 = BigInt(0);

// A non-negative decimal with at most `places` decimals and 12 whole digits,
// commas allowed ("1,053.00"); null when it isn't one.
export function parseAmount(text: string, places: number): Rational | null {
  const value = text.trim().replace(/,/g, "");
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${places}})?$`).test(value)) return null;
  return parseDecimal(value);
}

// Whole dollars and cents as cents ("150.5" → 15050).
export function parseCents(text: string): bigint | null {
  const value = parseAmount(text, 2);
  return value == null ? null : toCents(value);
}

// A whole number above zero ("100"); null otherwise.
export function parseWholeNumber(text: string): bigint | null {
  const value = text.trim();
  if (!/^\d{1,12}$/.test(value)) return null;
  const n = BigInt(value);
  return n > B0 ? n : null;
}

// Cents per unit, exact and rounded half up to the cent.
export function perUnit(totalCents: bigint, units: bigint): { exact: Rational; cents: bigint } {
  const exact = div(fromInteger(totalCents), fromInteger(units));
  return { exact, cents: toCents(div(exact, fromInteger(100))) };
}

// Tenths of a percent as text: 346 → "34.6%".
export function tenthsText(tenths: bigint): string {
  const negative = tenths < B0;
  const abs = negative ? -tenths : tenths;
  return `${negative ? "-" : ""}${abs / BigInt(10)}.${abs % BigInt(10)}%`;
}

// a ÷ b as tenths of a percent, rounded half up (b > 0).
export function shareTenths(a: bigint, b: bigint): bigint {
  return toCents(div(fromInteger(a * BigInt(10)), fromInteger(b)));
}
