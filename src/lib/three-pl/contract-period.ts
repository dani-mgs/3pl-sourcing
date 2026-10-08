// Contract period, in whole months. Mirrors the column's check constraint.
export const CONTRACT_PERIOD_MIN = 1;
export const CONTRACT_PERIOD_MAX = 120;
export const CONTRACT_PERIOD_ERROR = `Contract period must be a whole number of months from ${CONTRACT_PERIOD_MIN} to ${CONTRACT_PERIOD_MAX}, or left empty.`;

// "36 months" / "1 month"; null when not set.
export function formatContractPeriod(months: number | null | undefined): string | null {
  if (months == null) return null;
  return `${months} ${months === 1 ? "month" : "months"}`;
}
