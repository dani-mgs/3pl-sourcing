import { add, fraction, fromInteger, mul, parseDecimal, type Rational } from "./rational";

// Parses an HTS rate of duty as USITC publishes it ("6%", "Free",
// "1.9¢/kg", "0.4¢/kg + 20%", "$1.035/kg", "33 1/3%", "2¢ each + 5%").
//
// Only rates that depend on nothing but the customs value and one quantity
// are calculated. Anything with a qualifier ("on drained weight", "on the
// case", "less … for each degree", "The rate applicable to …", two different
// units) is reported as unsupported, with the original text, so the UI can say
// it can't be calculated automatically rather than guess.

export type SpecificRate = {
  // US cents per unit (dollar rates are converted: $1.035 → 103.5¢).
  centsPerUnit: Rational;
  // The unit token as published ("kg", "pf. liter", "1000", "each").
  unit: string;
  // How the quantity is asked for and shown ("kg", "proof liters").
  unitLabel: string;
};

export type ParsedRate =
  | { kind: "free" }
  | { kind: "rate"; adValoremPct: Rational | null; specific: SpecificRate | null }
  | { kind: "unsupported"; text: string };

// Published unit token → label. Anything not listed is unsupported.
const UNIT_LABELS: Record<string, string> = {
  kg: "kg",
  "clean kg": "clean kg",
  g: "grams",
  t: "metric tons",
  liter: "liters",
  "pf. liter": "proof liters",
  "pf.liter": "proof liters",
  bbl: "barrels",
  m: "meters",
  "lin. m": "linear meters",
  m2: "m²",
  m3: "m³",
  "pr.": "pairs",
  "doz.": "dozen",
  gross: "gross (144 units)",
  "1000": "thousands",
  "1,000": "thousands",
  thousand: "thousands",
  each: "units (each)",
  head: "head",
  article: "articles",
  pack: "packs",
};

const AD_VALOREM = /^(\d+(?:\.\d+)?)(?: (\d+)\/(\d+))?%$/;
const CENTS = /^(\d+(?:\.\d+)?)¢\s*(?:\/\s*(.+)|(each))$/;
const DOLLARS = /^\$(\d+(?:\.\d+)?)\s*(?:\/\s*(.+)|(each))$/;

function normalizeUnit(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function parseTerm(term: string): { adValoremPct: Rational } | { specific: SpecificRate } | null {
  const pct = AD_VALOREM.exec(term);
  if (pct) {
    let value = parseDecimal(pct[1]);
    if (pct[2]) value = add(value, fraction(BigInt(pct[2]), BigInt(pct[3])));
    return { adValoremPct: value };
  }
  for (const [pattern, centsPerDollar] of [
    [CENTS, 1],
    [DOLLARS, 100],
  ] as const) {
    const match = pattern.exec(term);
    if (!match) continue;
    const unit = normalizeUnit(match[2] ?? match[3]);
    const unitLabel = UNIT_LABELS[unit];
    if (!unitLabel) return null;
    const centsPerUnit = mul(parseDecimal(match[1]), fromInteger(centsPerDollar));
    return { specific: { centsPerUnit, unit, unitLabel } };
  }
  return null;
}

export function parseRateText(raw: string | null | undefined): ParsedRate {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return { kind: "unsupported", text };
  if (/^free$/i.test(text)) return { kind: "free" };

  let adValoremPct: Rational | null = null;
  let specific: SpecificRate | null = null;
  for (const term of text.split(/\s*\+\s*/)) {
    const parsed = parseTerm(term);
    if (!parsed) return { kind: "unsupported", text };
    if ("adValoremPct" in parsed) {
      if (adValoremPct) return { kind: "unsupported", text };
      adValoremPct = parsed.adValoremPct;
    } else {
      if (specific) return { kind: "unsupported", text };
      specific = parsed.specific;
    }
  }
  return { kind: "rate", adValoremPct, specific };
}
