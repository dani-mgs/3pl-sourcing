import { formatHtsCode } from "@/lib/tariff/hts-code";
import { canUseInCalculator, generalRateDisplay, mayApplyLabel, type LookupLine } from "@/lib/tariff/hts-lookup";

export const linkClass =
  "rounded font-medium text-move-navy hover:text-move-green hover:underline focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none";

// Rate, units, programs that may apply and "Use this code" for one HTS line,
// shared by the search results and the browse tree. Buttons are type="button":
// the popup sits beside the calculator form and must never submit it.
export function LineFacts({ line, onPick }: { line: LookupLine; onPick: (line: LookupLine) => void }) {
  const rate = generalRateDisplay(line);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-muted">
      {rate && (
        <span>
          General rate: <span className="font-medium text-move-navy">{rate.text}</span>
          {rate.fromCode && <> (from {rate.fromCode})</>}
          {!rate.calculable && <span className="text-[#92400E]"> · can&apos;t be calculated automatically</span>}
        </span>
      )}
      {line.units.length > 0 && <span>Units: {line.units.join(", ")}</span>}
      {line.may_apply.map((program) => (
        <span
          key={program.key}
          className="rounded-full border border-[#FBBF24] bg-[#FFFBEB] px-2 py-0.5 font-medium text-[#92400E]"
        >
          {mayApplyLabel(program)}
        </span>
      ))}
      {canUseInCalculator(line) ? (
        <button
          type="button"
          onClick={() => onPick(line)}
          className="rounded-lg border border-move-navy px-2.5 py-1 font-medium text-move-navy outline-none hover:bg-move-navy hover:text-white focus-visible:ring-2 focus-visible:ring-move-green"
          aria-label={`Use ${formatHtsCode(line.hts_code)} in the Tariff Calculator`}
        >
          Use this code
        </button>
      ) : (
        line.has_children &&
        (line.hts_code.length === 8 || line.hts_code.length === 10) && <span>Choose a 10-digit line under it</span>
      )}
    </div>
  );
}
