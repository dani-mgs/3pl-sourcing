import { formatHtsCode } from "./hts-code";

// Which HTS line a typed code means, from the lines read for it: an exact 8-
// or 10-digit match; else, for an 8-digit code with no line of its own (the
// HTS merges 8471.30.01 into 8471.30.01.00), its only 10-digit line; with
// several, the user must choose. Pure; findLine and the Landed Cost batch
// loader read the lines.

export type HtsLineRecord = {
  hts_code: string;
  description: string;
  ancestor_descriptions: string[];
  units: string[];
  general_rate: string | null;
  special_rate: string | null;
  other_rate: string | null;
};

export const LINE_COLUMNS =
  "hts_code, description, ancestor_descriptions, units, general_rate, special_rate, other_rate";

export type HtsLineMatch = { line: HtsLineRecord; matchedTenDigit: boolean } | { error: string } | null;

export function severalLinesError(digits: string): string {
  return `${formatHtsCode(digits)} has several 10-digit statistical lines. Enter the full 10-digit code.`;
}

// `lines` may hold any lines of the release; only the code's own line and
// (for 8 digits) the 10-digit lines under it count.
export function matchHtsLine(digits: string, lines: HtsLineRecord[]): HtsLineMatch {
  const exact = lines.find((l) => l.hts_code === digits);
  if (exact) return { line: exact, matchedTenDigit: false };
  if (digits.length !== 8) return null;
  const children = lines.filter((l) => l.hts_code.length === 10 && l.hts_code.startsWith(digits));
  if (children.length === 0) return null;
  if (children.length > 1) return { error: severalLinesError(digits) };
  return { line: children[0], matchedTenDigit: true };
}
