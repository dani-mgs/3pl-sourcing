import { Badge } from "@/components/ui/badge";

export type ProviderStatus =
  | "Potential"
  | "Contacted"
  | "Discovery Call"
  | "Quotation Received"
  | "Negotiation"
  | "Vetted"
  | "Rejected";

// Colors read as progressively positive toward Move Green as the pipeline
// nears "Vetted" — "Rejected" is the only negative/red status. See
// docs/DESIGN_SYSTEM.md's "Status pipeline badges" section.
export const STATUS_STYLES: Record<ProviderStatus, string> = {
  Potential: "bg-[#F1F2F4] text-[#6B7280]",
  Contacted: "bg-[#E3F2FD] text-[#1565C0]",
  "Discovery Call": "bg-[#E0F2F1] text-[#00796B]",
  "Quotation Received": "bg-[#E8F5E9] text-[#2E7D32]",
  Negotiation: "bg-[#DCFCE7] text-[#15803D]",
  Vetted: "bg-[#D1FAE5] text-[#059669]",
  Rejected: "bg-[#FDE8E8] text-[#DC2626]",
};

// Solid dot color used for the status Select's per-option indicator —
// the badge's own text color reused, since the pale badge background
// wouldn't read as a visible dot fill.
export const STATUS_DOT_COLORS: Record<ProviderStatus, string> = {
  Potential: "bg-[#6B7280]",
  Contacted: "bg-[#1565C0]",
  "Discovery Call": "bg-[#00796B]",
  "Quotation Received": "bg-[#2E7D32]",
  Negotiation: "bg-[#15803D]",
  Vetted: "bg-[#059669]",
  Rejected: "bg-[#DC2626]",
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STATUS_STYLES[status]}`}>
      {status}
    </Badge>
  );
}
