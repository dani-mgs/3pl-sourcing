import { PenLine } from "lucide-react";
import { INCLUDES_MANUAL_RATE, type ManualLayerView } from "@/lib/landed-cost/result-view";

// How a manual rate is shown everywhere (result panel, version page,
// comparison): in words, the icon only repeating them.

export function IncludesManualRate() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-border bg-neutral-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-move-navy">
      <PenLine aria-hidden="true" className="size-3 shrink-0" />
      {INCLUDES_MANUAL_RATE}
    </span>
  );
}

export function ManualMark() {
  return <span className="rounded-full bg-[#E3E9F5] px-1.5 py-0.5 text-[10px] font-semibold text-move-navy uppercase">Manual</span>;
}

export function NotSavedMark() {
  return <span className="text-[10px] font-semibold text-[#92400E] uppercase">Not saved yet</span>;
}

// Value, the app's own rate (for an override), the reason, and who set or changed it.
export function ManualLayerDetails({ manual }: { manual: ManualLayerView }) {
  return (
    <div className="mt-0.5 flex flex-col gap-0.5 text-neutral-muted">
      <p>
        <span className="font-medium text-move-navy">Manual {manual.kind === "replace" ? "rate" : "duty"}: {manual.value}</span>
        {manual.appRate && <> · App rate: {manual.appRate}</>}
      </p>
      <p>Reason: {manual.reason}</p>
      <p>
        {manual.setBy}
        {manual.changedBy && <> · {manual.changedBy}</>}
      </p>
      {manual.note && <p className="font-medium text-[#92400E]">{manual.note}</p>}
    </div>
  );
}
