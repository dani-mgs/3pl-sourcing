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
  | "exempt_pending";

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

// What the total leaves out. Used everywhere an estimate's total is shown,
// so the label reads the same on live, saved and listed estimates.
export function excludedPrograms(warnings: ProgramWarning[], customsValueUsd: number): ExcludedProgram[] {
  return warnings
    .filter((w) => w.counted !== false)
    .map((w) => ({
      programKey: w.programKey,
      name: w.name,
      hint: w.hint !== undefined ? w.hint : legacyHint(w, customsValueUsd),
    }));
}

export function excludedCount(warnings: unknown): number {
  return Array.isArray(warnings)
    ? warnings.filter((w) => !(w && typeof w === "object" && (w as ProgramWarning).counted === false)).length
    : 0;
}

export function totalLabel(excludedCount: number, includesAdditional = false): string {
  const what = includesAdditional ? "Duties + fees (USD)" : "Base duty + fees (USD)";
  if (excludedCount === 0) return "Estimated duties and fees (USD)";
  const programs = excludedCount === 1 ? "program" : "programs";
  return `${what} — EXCLUDES ${excludedCount} additional duty ${programs} that may apply`;
}
