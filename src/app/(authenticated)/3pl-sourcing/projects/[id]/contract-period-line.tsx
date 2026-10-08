import { formatContractPeriod } from "@/lib/three-pl/contract-period";

// Header line on the project page. Hidden when the period isn't set, the same
// as the forwarder Shipment Profile hides a blank project duration.
export function ContractPeriodLine({ months }: { months: number | null }) {
  const text = formatContractPeriod(months);
  if (!text) return null;
  return (
    <p className="mt-1 text-sm font-medium text-move-navy">
      <span className="text-neutral-muted">Contract period</span> · {text}
    </p>
  );
}
