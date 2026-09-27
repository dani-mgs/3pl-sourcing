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

export function formatCurrency(amount: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(amount);
}
