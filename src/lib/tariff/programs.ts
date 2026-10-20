// Additional-duty programs and the warnings shown for those not (yet)
// counted in an estimate's total. Which programs count is decided in
// additional-duties.ts; this file holds the program rows, their warning
// triggers and the "EXCLUDES" summary every total shows.

export type DutyProgramRow = {
  key: string;
  name: string;
  status: "not_loaded" | "inactive";
  warning_text: string;
  trigger_origins: string[] | null;
  trigger_hts_prefixes: string[] | null;
  // The first entry date the warning shows (YYYY-MM-DD); NULL = any date.
  trigger_from: string | null;
  // Origin → single known flat percent, read from the HTS and not
  // expert-reviewed; only used while a program has no duty rows.
  indicative_rates: Record<string, unknown> | null;
  source_label: string;
  source_url: string;
  sort_order: number;
};

export type ProgramWarningKind =
  // No duty rows yet.
  | "not_loaded"
  // Rows loaded, not yet reviewed by a tariff editor.
  | "pending_review"
  // Exempt if another program (not loaded yet) applies.
  | "depends_on"
  // Pending rows say it's exempt; shown, not counted.
  | "exempt_pending"
  // The best matching row's rate isn't confirmed; named, not counted.
  | "unconfirmed"
  // Only rows with unmet conditions match (e.g. Russian-smelted aluminium);
  // a note, not excluded from the total.
  | "conditional";

export type ProgramWarning = {
  programKey: string;
  name: string;
  text: string;
  sourceLabel: string;
  sourceUrl: string;
  // Rows saved before PR 2a have none of the fields below.
  kind?: ProgramWarningKind;
  // A flat percent the program could add, when there's a single one.
  indicativePct?: number | null;
  // What's shown next to the program under the total, e.g. "could add up to
  // 12.5% (about $1,250.00) — indicative rate from the HTS, not
  // expert-reviewed". Null to just name it.
  hint?: string | null;
  // Whether the total excludes it (an exempt-pending note doesn't).
  counted?: boolean;
};

// Not a program: the MPF fees of the entry date's fiscal year aren't entered,
// so last year's are used (fee-rollover.ts). No programKey or name; never
// counted among the programs a total EXCLUDES, but it makes the estimate
// incomplete.
export type FeesNotEnteredWarning = {
  kind: "fees_not_entered";
  text: string;
  fiscalYear: number;
  startsOn: string;
  counted: false;
};

// What an estimate's warnings list holds (saved as duty_estimates.warnings).
export type EstimateWarning = ProgramWarning | FeesNotEnteredWarning;

export function isProgramWarning(w: EstimateWarning): w is ProgramWarning {
  return w.kind !== "fees_not_entered";
}

// The fees warning in a warnings list (stored or live), if any.
export function feesNotEnteredWarning(warnings: unknown): FeesNotEnteredWarning | null {
  if (!Array.isArray(warnings)) return null;
  const found = warnings.find((w) => w && typeof w === "object" && (w as { kind?: unknown }).kind === "fees_not_entered");
  return (found as FeesNotEnteredWarning | undefined) ?? null;
}

// Origin and HTS triggers (NULL = any). Deliberately broad: a warning that
// may not apply beats a duty silently left out.
export function matchesProgramTrigger(
  program: Pick<DutyProgramRow, "trigger_origins" | "trigger_hts_prefixes">,
  originCountry: string,
  htsCode: string,
): boolean {
  return (
    (!program.trigger_origins || program.trigger_origins.includes(originCountry)) &&
    (!program.trigger_hts_prefixes || program.trigger_hts_prefixes.some((p) => htsCode.startsWith(p)))
  );
}

// Whether the program has started by the entry date (both UTC calendar
// dates, compared as strings). A program due later is never named.
export function programStarted(program: Pick<DutyProgramRow, "trigger_from">, entryDate: string): boolean {
  return program.trigger_from == null || program.trigger_from <= entryDate;
}

export type ExcludedProgram = {
  programKey: string;
  name: string;
  hint: string | null;
};

function legacyHint(w: ProgramWarning, customsValueUsd: number): string | null {
  const pct = w.indicativePct ?? null;
  if (pct == null) return null;
  const about = Math.round(customsValueUsd * pct) / 100;
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(about);
  return `could add up to ${pct}% (about ${amount})`;
}

// The one rule for "left out of the total": every warning except those marked
// counted: false (warnings saved before PR 2a have no flag and count). The
// fees warning is never a program left out.
function isExcludedFromTotal(w: unknown): boolean {
  if (w && typeof w === "object" && (w as { kind?: unknown }).kind === "fees_not_entered") return false;
  return !(w && typeof w === "object" && (w as ProgramWarning).counted === false);
}

// What the total leaves out. Used everywhere an estimate's total is shown,
// so the label reads the same on live, saved and listed estimates.
export function excludedPrograms(warnings: EstimateWarning[], customsValueUsd: number): ExcludedProgram[] {
  return warnings
    .filter(isProgramWarning)
    .filter(isExcludedFromTotal)
    .map((w) => ({
      programKey: w.programKey,
      name: w.name,
      hint: w.hint !== undefined ? w.hint : legacyHint(w, customsValueUsd),
    }));
}

export function excludedCount(warnings: unknown): number {
  return Array.isArray(warnings) ? warnings.filter(isExcludedFromTotal).length : 0;
}

// An estimate is incomplete when its total leaves out at least one program
// that may apply (the same count as excludedCount), or its fiscal year's MPF
// fees aren't entered; its amount isn't final.
export const INCOMPLETE_ESTIMATE_LABEL = "Incomplete estimate";

export function isIncompleteEstimate(warnings: unknown): boolean {
  return excludedCount(warnings) > 0 || feesNotEnteredWarning(warnings) != null;
}

export function incompleteNote(excluded: number): string {
  return excluded === 1
    ? "Not final: 1 additional duty program is not included."
    : `Not final: ${excluded} additional duty programs are not included.`;
}

export function totalLabel(excludedCount: number, includesAdditional = false): string {
  const what = includesAdditional ? "Duties + fees (USD)" : "Base duty + fees (USD)";
  if (excludedCount === 0) return "Estimated duties and fees (USD)";
  const programs = excludedCount === 1 ? "program" : "programs";
  return `${what} — EXCLUDES ${excludedCount} additional duty ${programs} that may apply`;
}
