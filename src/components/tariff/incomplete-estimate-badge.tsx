import { AlertTriangle } from "lucide-react";
import { INCOMPLETE_ESTIMATE_LABEL } from "@/lib/tariff/programs";

// Marks a duty estimate whose total leaves out additional duty programs
// (isIncompleteEstimate). The words carry the meaning; the amber colours,
// border and icon only repeat it. Same warning palette as WARNING_BOX_CLASS.
export function IncompleteEstimateBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[#FBBF24] bg-[#FFFBEB] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[#92400E]${className ? ` ${className}` : ""}`}
      data-testid="incomplete-estimate"
    >
      <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
      {INCOMPLETE_ESTIMATE_LABEL}
    </span>
  );
}
