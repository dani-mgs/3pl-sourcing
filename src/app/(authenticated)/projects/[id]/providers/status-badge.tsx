import { Badge } from "@/components/ui/badge";

export type ProviderStatus =
  | "Potential / Not Contacted"
  | "Baseline"
  | "Contacted"
  | "Client Requirements Sent"
  | "Scheduled for Discovery Call"
  | "Waiting for Quotation"
  | "Reviewing Quotation"
  | "Clarifications"
  | "Negotiation"
  | "Shortlisted"
  | "Vetted"
  | "Unfit"
  | "Do not Contact"
  | "Withdrawn / No Response"
  | "Completed / Closed";

// See docs/DESIGN_SYSTEM.md's "Status colors (14 values)" table.
export const STATUS_STYLES: Record<ProviderStatus, string> = {
  "Potential / Not Contacted": "bg-[#F1F2F4] text-[#6B7280]",
  Baseline: "bg-[#EEF0F4] text-[#4B5563]",
  Contacted: "bg-[#E3F2FD] text-[#1565C0]",
  "Client Requirements Sent": "bg-[#E1EEFB] text-[#0D47A1]",
  "Scheduled for Discovery Call": "bg-[#E0F2F1] text-[#00796B]",
  "Waiting for Quotation": "bg-[#FFF8E1] text-[#B8860B]",
  "Reviewing Quotation": "bg-[#FFF3CD] text-[#92700A]",
  Clarifications: "bg-[#FFE8CC] text-[#B15400]",
  Negotiation: "bg-[#DCFCE7] text-[#15803D]",
  Shortlisted: "bg-[#D1FAE5] text-[#0F766E]",
  Vetted: "bg-[#D1FAE5] text-[#059669]",
  Unfit: "bg-[#FDE8E8] text-[#DC2626]",
  "Do not Contact": "bg-[#FBE0E0] text-[#B91C1C]",
  "Withdrawn / No Response": "bg-[#F1F2F4] text-[#9CA3AF]",
  "Completed / Closed": "bg-[#E3E9F5] text-[#192E5B]",
};

// Solid dot color used for the status Select's per-option indicator —
// the badge's own text color reused, since the pale badge background
// wouldn't read as a visible dot fill.
export const STATUS_DOT_COLORS: Record<ProviderStatus, string> = {
  "Potential / Not Contacted": "bg-[#6B7280]",
  Baseline: "bg-[#4B5563]",
  Contacted: "bg-[#1565C0]",
  "Client Requirements Sent": "bg-[#0D47A1]",
  "Scheduled for Discovery Call": "bg-[#00796B]",
  "Waiting for Quotation": "bg-[#B8860B]",
  "Reviewing Quotation": "bg-[#92700A]",
  Clarifications: "bg-[#B15400]",
  Negotiation: "bg-[#15803D]",
  Shortlisted: "bg-[#0F766E]",
  Vetted: "bg-[#059669]",
  Unfit: "bg-[#DC2626]",
  "Do not Contact": "bg-[#B91C1C]",
  "Withdrawn / No Response": "bg-[#9CA3AF]",
  "Completed / Closed": "bg-[#192E5B]",
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STATUS_STYLES[status]}`}>
      {status}
    </Badge>
  );
}

export type AssessmentStatus =
  | "Under Assessment"
  | "Move Recommended"
  | "Fit"
  | "Unfit"
  | "Awarded/Approved";

// See docs/DESIGN_SYSTEM.md's "Assessment colors (5 values)" table.
export const ASSESSMENT_STYLES: Record<AssessmentStatus, string> = {
  "Under Assessment": "bg-[#F1F2F4] text-[#6B7280]",
  Fit: "bg-[#DCFCE7] text-[#15803D]",
  "Move Recommended": "bg-[#D1FAE5] text-[#059669]",
  Unfit: "bg-[#FDE8E8] text-[#DC2626]",
  "Awarded/Approved": "bg-[#E3E9F5] text-[#192E5B]",
};

export const ASSESSMENT_DOT_COLORS: Record<AssessmentStatus, string> = {
  "Under Assessment": "bg-[#6B7280]",
  Fit: "bg-[#15803D]",
  "Move Recommended": "bg-[#059669]",
  Unfit: "bg-[#DC2626]",
  "Awarded/Approved": "bg-[#192E5B]",
};

// Same badge shape/style as StatusBadge, different color set — assessment
// badges are meant to look visually identical in format to status badges.
export function AssessmentBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge variant="outline" className={`border-transparent ${ASSESSMENT_STYLES[status]}`}>
      {status}
    </Badge>
  );
}
