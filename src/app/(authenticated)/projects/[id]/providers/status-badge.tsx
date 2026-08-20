export type ProviderStatus =
  | "Potential"
  | "Contacted"
  | "Discovery Call"
  | "Quotation Received"
  | "Negotiation"
  | "Vetted"
  | "Rejected";

const STATUS_STYLES: Record<ProviderStatus, string> = {
  Potential: "bg-[#F1F2F4] text-[#6B7280]",
  Contacted: "bg-[#E8F5E9] text-[#3A9A3E]",
  "Discovery Call": "bg-[#E3E9F5] text-[#192E5B]",
  "Quotation Received": "bg-[#FFF0EC] text-[#FF5E43]",
  Negotiation: "bg-[#FFE8E0] text-[#E5502E]",
  Vetted: "bg-[#E1F5E3] text-[#2E7D32]",
  Rejected: "bg-[#FDE8E8] text-[#DC2626]",
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
