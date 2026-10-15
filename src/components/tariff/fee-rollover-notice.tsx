import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { overviewNote, reminderLines, type FeeRolloverReminder } from "@/lib/tariff/fee-rollover";

// Reminders that the customs fiscal year's MPF rates are due (or overdue) on
// Duty data → Fees and the Duty data overview. No hooks; server-rendered.

const BOX_CLASS = "rounded-xl border border-[#FBBF24] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]";

// The full reminder, telling the reader what to do: an editor adds the rows,
// anyone else asks a tariff editor to.
export function FeeRolloverReminderBox({
  reminder,
  canEditFees,
  className = "",
}: {
  reminder: FeeRolloverReminder;
  canEditFees: boolean;
  className?: string;
}) {
  const [first, ...rest] = reminderLines(reminder, canEditFees);
  return (
    <div className={`${BOX_CLASS}${className ? ` ${className}` : ""}`} role="note" data-testid="fee-rollover-reminder">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {first}
      </p>
      {rest.map((line) => (
        <p key={line} className="mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}

// One line on the overview, linking to the Fees page.
export function FeeRolloverOverviewNote({ reminder, className = "" }: { reminder: FeeRolloverReminder; className?: string }) {
  return (
    <p className={`${BOX_CLASS}${className ? ` ${className}` : ""}`} role="note" data-testid="fee-rollover-note">
      {overviewNote(reminder)}{" "}
      <Link
        href="/tariff-calculator/duty-data/fees"
        className="rounded font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-move-green"
      >
        Customs fees →
      </Link>
    </p>
  );
}
