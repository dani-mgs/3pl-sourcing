import { formatCurrency } from "@/lib/currency";
import { centsToNumber, toCents, toFixed, type Rational } from "./rational";

// How estimate lines write amounts and rates in their rate text and detail.
// Shared by the duty line (calculate.ts) and the fee lines (customs-fees.ts).

export function usd(value: Rational): string {
  return formatCurrency(centsToNumber(toCents(value)), "USD");
}

export function usdText(value: number | string): string {
  return formatCurrency(Number(value), "USD");
}

export function pctText(value: Rational, places = 4): string {
  // Trim trailing zeros: 0.346400 → 0.3464, 6.0000 → 6.
  return `${toFixed(value, places).replace(/\.?0+$/, "")}%`;
}
