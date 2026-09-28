// Forwarder project status (Active / On Hold / Completed), styled like the
// 3PL status pills.
const STATUS_STYLES: Record<string, string> = {
  Active: "bg-[#DCFCE7] text-[#15803D]",
  "On Hold": "bg-[#FFF8E1] text-[#B8860B]",
  Completed: "bg-[#E3E9F5] text-[#192E5B]",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        STATUS_STYLES[status] ?? "bg-[#F1F2F4] text-[#6B7280]"
      }`}
    >
      {status}
    </span>
  );
}
