import { formatCurrency } from "@/lib/currency";

// The two lines under the big value on the Current summary tile. Display only:
// the freight cost is the same number the tile already shows as its big value,
// and the invoice value is the project's own field.

const plainAmount = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CurrentTileLines = {
  // "$7,792.81 Freight Cost"; null when there's no current freight cost (the
  // big value already says so).
  freight: string | null;
  // "$28,000.00 Commercial Invoice Value", or "Commercial Invoice Value: Not set"
  // when the value is blank or zero. Formatted in the project's own currency,
  // and as a bare number when the project has none.
  invoice: string;
};

export function currentTileLines(project: {
  current_freight_cost_usd: number | null;
  invoice_value: number | null;
  invoice_currency: string | null;
}): CurrentTileLines {
  const freight =
    project.current_freight_cost_usd == null
      ? null
      : `${formatCurrency(project.current_freight_cost_usd, "USD")} Freight Cost`;

  const value = project.invoice_value;
  if (value == null || !(value > 0)) {
    return { freight, invoice: "Commercial Invoice Value: Not set" };
  }
  const amount = project.invoice_currency
    ? formatCurrency(value, project.invoice_currency)
    : plainAmount.format(value);
  return { freight, invoice: `${amount} Commercial Invoice Value` };
}
