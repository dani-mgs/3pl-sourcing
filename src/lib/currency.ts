export const CURRENCY_OPTIONS = [
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "CAD",
  "AUD",
  "MXN",
  "INR",
  "PHP",
  "VND",
  "THB",
  "HKD",
  "SGD",
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

const formatters = new Map<string, Intl.NumberFormat>();

// Shows the stored value with up to 2 decimals in every currency. Without
// maximumFractionDigits, zero-decimal currencies (JPY, VND) round on display,
// so a stored 2.85 would read ¥3. The currency's own minimum still applies
// (USD 21 → $21.00, JPY 21 → ¥21).
export function formatCurrency(amount: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(amount);
}
