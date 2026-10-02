import type { ReviewStatus } from "@/lib/tariff/additional-duties";

// Same badge colours as the app's status palette (docs/DESIGN_SYSTEM.md):
// reviewed = Fit green, pending = Waiting amber, not loaded = neutral.
const STYLES: Record<ReviewStatus, { label: string; className: string }> = {
  reviewed: { label: "Reviewed", className: "bg-[#DCFCE7] text-[#15803D]" },
  pending_review: { label: "Pending review", className: "bg-[#FFF8E1] text-[#B8860B]" },
  not_loaded: { label: "Not loaded", className: "bg-[#F1F2F4] text-[#6B7280]" },
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const style = STYLES[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}>
      {style.label}
    </span>
  );
}
