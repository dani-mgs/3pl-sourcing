// Preset/custom chip values are joined with "; " rather than "," because several
// preset labels (e.g. "Fulfillment (Pick, Check, Pack)") contain commas themselves,
// which would otherwise fragment on split. No preset or expected custom value
// contains a semicolon.
export const CHIP_SEPARATOR = "; ";

export function parseChipValue(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((token) => token.trim())
    .filter(Boolean);
}
