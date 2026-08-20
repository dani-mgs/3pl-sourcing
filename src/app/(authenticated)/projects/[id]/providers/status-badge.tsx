export type ProviderStatus =
  | "Potential"
  | "Contacted"
  | "Discovery Call"
  | "Quotation Received"
  | "Negotiation"
  | "Vetted"
  | "Rejected";

const STATUS_STYLES: Record<ProviderStatus, string> = {
  Potential: "bg-[#F1F2F6] text-[#6B7280]",
  Contacted: "bg-[#E8E7FC] text-[#4F46E5]",
  "Discovery Call": "bg-[#FEF3E2] text-[#B45309]",
  "Quotation Received": "bg-[#FEF3E2] text-[#F59E0B]",
  Negotiation: "bg-[#FFE4E0] text-[#EA580C]",
  Vetted: "bg-[#D1FAE5] text-[#059669]",
  Rejected: "bg-[#FFE1E7] text-[#E11D48]",
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
