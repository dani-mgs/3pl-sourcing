// Additional-duty programs whose duties aren't in the calculator yet. Rather
// than leave them out silently, each one whose trigger matches the origin and
// HTS code is shown as a warning ("may apply — not included"), and the total
// is labelled as excluding them.

export type DutyProgramRow = {
  key: string;
  name: string;
  status: "not_loaded" | "inactive";
  warning_text: string;
  trigger_origins: string[] | null;
  trigger_hts_prefixes: string[] | null;
  // Origin → single known flat percent, where there is one (see migration).
  indicative_rates: Record<string, unknown> | null;
  source_label: string;
  source_url: string;
  sort_order: number;
};

export type ProgramWarning = {
  programKey: string;
  name: string;
  text: string;
  sourceLabel: string;
  sourceUrl: string;
  // The program's flat additional percent for this origin, when it has a
  // single known one; null when the rate depends on the product, is a
  // minimum-total rate, or isn't verified. Missing on rows saved before it existed.
  indicativePct?: number | null;
};

function flatRate(rates: Record<string, unknown> | null, origin: string): number | null {
  const value = rates?.[origin];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function matchProgramWarnings(
  programs: DutyProgramRow[],
  originCountry: string,
  htsCode: string,
): ProgramWarning[] {
  return programs
    .filter((p) => p.status === "not_loaded")
    .filter((p) => !p.trigger_origins || p.trigger_origins.includes(originCountry))
    .filter((p) => !p.trigger_hts_prefixes || p.trigger_hts_prefixes.some((prefix) => htsCode.startsWith(prefix)))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      programKey: p.key,
      name: p.name,
      text: p.warning_text,
      sourceLabel: p.source_label,
      sourceUrl: p.source_url,
      indicativePct: flatRate(p.indicative_rates, originCountry),
    }));
}

export type ExcludedProgram = {
  programKey: string;
  name: string;
  // "could add up to 12.5% (about $1,250.00)", or null to just name it.
  indicativePct: number | null;
  indicativeUsd: number | null;
};

// What the total leaves out. Used everywhere an estimate's total is shown,
// so the label reads the same on the live, saved and listed estimates.
export function excludedPrograms(warnings: ProgramWarning[], customsValueUsd: number): ExcludedProgram[] {
  return warnings.map((w) => {
    const pct = w.indicativePct ?? null;
    return {
      programKey: w.programKey,
      name: w.name,
      indicativePct: pct,
      indicativeUsd: pct == null ? null : Math.round(customsValueUsd * pct) / 100,
    };
  });
}

export function totalLabel(excludedCount: number): string {
  if (excludedCount === 0) return "Estimated duties and fees (USD)";
  const programs = excludedCount === 1 ? "program" : "programs";
  return `Base duty + fees (USD) — EXCLUDES ${excludedCount} additional duty ${programs} that may apply`;
}
