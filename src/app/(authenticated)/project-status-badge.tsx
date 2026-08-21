import { Badge } from "@/components/ui/badge";

// Same WCAG-audited color pairs used by the provider status badges
// (see projects/[id]/providers/status-badge.tsx), reused here for
// visual consistency across both status pipelines.
const STATUS_STYLES: Record<string, string> = {
  Active: "bg-[#E8F5E9] text-[#256B29]",
  "On Hold": "bg-[#FFE8E0] text-[#9A3412]",
  Completed: "bg-[#E3E9F5] text-[#192E5B]",
};

const DEFAULT_STYLE = "bg-[#F1F2F4] text-[#6B7280]";

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${STATUS_STYLES[status] ?? DEFAULT_STYLE}`}
    >
      {status}
    </Badge>
  );
}
