import { Badge } from "@/components/ui/badge";

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
  // Text darkened from the doc's #3A9A3E (3.18:1 contrast on this bg, fails
  // WCAG AA) to #256B29 (5.81:1) — legibility overrides the exact hex.
  Contacted: "bg-[#E8F5E9] text-[#256B29]",
  "Discovery Call": "bg-[#E3E9F5] text-[#192E5B]",
  // Text darkened from the doc's #FF5E43 (2.73:1, fails) to #B23A1F (5.38:1).
  "Quotation Received": "bg-[#FFF0EC] text-[#B23A1F]",
  // Text darkened from the doc's #E5502E (3.24:1, fails) to #9A3412 (6.22:1).
  Negotiation: "bg-[#FFE8E0] text-[#9A3412]",
  Vetted: "bg-[#E1F5E3] text-[#2E7D32]",
  Rejected: "bg-[#FDE8E8] text-[#DC2626]",
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STATUS_STYLES[status]}`}>
      {status}
    </Badge>
  );
}
