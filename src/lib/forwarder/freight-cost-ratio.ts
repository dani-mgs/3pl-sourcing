// Freight Cost Ratio: freight cost in USD as a share of the project's invoice
// value (the workbook's "Freight Cost Ratio %", freight only: no duties, taxes
// or other charges). One definition for the summary tile, the Quote Comparison
// column and the exports. The invoice value is the project's, and only a USD
// invoice counts: the project has no exchange rate to convert another currency.

export const INVOICE_MISSING = "Set invoice value to calculate";
export const INVOICE_NOT_USD = "Invoice must be in USD to calculate";

export type InvoiceBasis = {
  invoice_value: number | null;
  invoice_currency: string | null;
};

// Why no ratio can be worked out from the invoice; null when it can.
export function invoiceRatioIssue(
  invoiceValue: number | null,
  invoiceCurrency: string | null,
): string | null {
  if (invoiceValue == null || !(invoiceValue > 0)) return INVOICE_MISSING;
  if (invoiceCurrency !== "USD") return INVOICE_NOT_USD;
  return null;
}

// BigInt() rather than literals: tsconfig targets ES2017.
const B2 = BigInt(2);
const B1000 = BigInt(1000);

// "15.7%". Rounds half-up on the exact cents, so 14.5 tenths of a percent
// always becomes 1.5% (a float and toFixed(1) can land on 1.4%).
export function formatRatioPercent(freightUsd: number, invoiceValue: number): string {
  const freight = BigInt(Math.round(freightUsd * 100));
  const invoice = BigInt(Math.round(invoiceValue * 100));
  const tenths = Number((freight * B1000 * B2 + invoice) / (invoice * B2));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

// The ratio text, or null when the freight or the invoice isn't usable.
export function freightCostRatioText(
  freightUsd: number | null,
  invoice: InvoiceBasis,
): string | null {
  if (freightUsd == null || freightUsd < 0) return null;
  if (invoiceRatioIssue(invoice.invoice_value, invoice.invoice_currency) != null) return null;
  return formatRatioPercent(freightUsd, invoice.invoice_value!);
}
