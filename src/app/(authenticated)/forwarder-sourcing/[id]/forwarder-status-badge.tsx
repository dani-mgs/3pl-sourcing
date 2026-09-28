import { Badge } from "@/components/ui/badge";
import type {
  ForwarderAssessment,
  ForwarderStatus,
} from "@/lib/forwarder/forwarder-fields";

// Forwarder status/assessment strings differ from 3PL's (extra statuses, and
// "Do Not Contact" / "Awarded / Approved" are spelled differently), so these
// are separate from src/app/.../3pl-sourcing/.../status-badge.tsx rather than
// shared. Colors follow the same families as DESIGN_SYSTEM.md's 3PL tables,
// extended for the two forwarder-only statuses.
export const FORWARDER_STATUS_STYLES: Record<ForwarderStatus, string> = {
  "Potential / Not Contacted": "bg-[#F1F2F4] text-[#6B7280]",
  Contacted: "bg-[#E3F2FD] text-[#1565C0]",
  "RFQ Sent": "bg-[#E1EEFB] text-[#0D47A1]",
  "Scheduled for Discovery / Clarification Call": "bg-[#E0F2F1] text-[#00796B]",
  "Waiting for Quotation": "bg-[#FFF8E1] text-[#B8860B]",
  "Reviewing Quotation": "bg-[#FFF3CD] text-[#92700A]",
  Clarifications: "bg-[#FFE8CC] text-[#B15400]",
  Negotiation: "bg-[#DCFCE7] text-[#15803D]",
  Shortlisted: "bg-[#D1FAE5] text-[#0F766E]",
  Vetted: "bg-[#D1FAE5] text-[#059669]",
  Unfit: "bg-[#FDE8E8] text-[#DC2626]",
  "Do Not Contact": "bg-[#FBE0E0] text-[#B91C1C]",
  "Withdrawn / No Response": "bg-[#F1F2F4] text-[#9CA3AF]",
  "Completed / Closed": "bg-[#E3E9F5] text-[#192E5B]",
};

export function ForwarderStatusBadge({ status }: { status: ForwarderStatus }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${FORWARDER_STATUS_STYLES[status]}`}
    >
      {status}
    </Badge>
  );
}

export const FORWARDER_ASSESSMENT_STYLES: Record<ForwarderAssessment, string> = {
  "Under Assessment": "bg-[#F1F2F4] text-[#6B7280]",
  Fit: "bg-[#DCFCE7] text-[#15803D]",
  "Move Recommended": "bg-[#D1FAE5] text-[#059669]",
  Unfit: "bg-[#FDE8E8] text-[#DC2626]",
  "Awarded / Approved": "bg-[#E3E9F5] text-[#192E5B]",
};

export function ForwarderAssessmentBadge({
  assessment,
}: {
  assessment: ForwarderAssessment;
}) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent whitespace-nowrap ${FORWARDER_ASSESSMENT_STYLES[assessment]}`}
    >
      {assessment}
    </Badge>
  );
}
