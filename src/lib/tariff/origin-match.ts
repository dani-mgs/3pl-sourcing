import { ORIGIN_COUNTRIES, ORIGIN_COUNTRY_CODES } from "./countries";

// Maps a forwarder project's free-text origin ("Vietnam", "Shenzhen, China")
// to an ISO country code, but only when there is exactly one reading. Anything
// else ("Korea", "China / Vietnam", "Asia") is left for the user to pick: a
// wrong origin changes which duties apply, so this never guesses.

export type OriginMatch =
  | { kind: "match"; code: string }
  // More than one country fits; the user picks (candidates are suggestions).
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "unknown" }
  | { kind: "empty" };

// Common names the runtime's English country names don't cover. A name that
// could mean more than one country maps to all of them.
const ALIASES: Record<string, string[]> = {
  "viet nam": ["VN"],
  prc: ["CN"],
  "mainland china": ["CN"],
  "peoples republic of china": ["CN"],
  "p r china": ["CN"],
  "pr china": ["CN"],
  uk: ["GB"],
  "great britain": ["GB"],
  britain: ["GB"],
  england: ["GB"],
  scotland: ["GB"],
  wales: ["GB"],
  "northern ireland": ["GB"],
  "south korea": ["KR"],
  "republic of korea": ["KR"],
  "korea republic of": ["KR"],
  "north korea": ["KP"],
  korea: ["KR", "KP"],
  turkey: ["TR"],
  "czech republic": ["CZ"],
  holland: ["NL"],
  "the netherlands": ["NL"],
  burma: ["MM"],
  "ivory coast": ["CI"],
  "cote divoire": ["CI"],
  russia: ["RU"],
  "russian federation": ["RU"],
  macedonia: ["MK"],
  laos: ["LA"],
  "hong kong": ["HK"],
  macau: ["MO"],
  macao: ["MO"],
  uae: ["AE"],
  emirates: ["AE"],
  "republic of china": ["TW"],
  swaziland: ["SZ"],
  "cape verde": ["CV"],
  "east timor": ["TL"],
  "vatican city": ["VA"],
  congo: ["CG", "CD"],
  "republic of the congo": ["CG"],
  "democratic republic of the congo": ["CD"],
  drc: ["CD"],
  "virgin islands": ["VG", "VI"],
  "british virgin islands": ["VG"],
  "us virgin islands": ["VI"],
  "st kitts and nevis": ["KN"],
  "saint kitts and nevis": ["KN"],
  "st lucia": ["LC"],
  "saint lucia": ["LC"],
  "st vincent and the grenadines": ["VC"],
  "saint vincent and the grenadines": ["VC"],
};

// Lower case, no accents, "&" as "and", punctuation as spaces, no leading
// "the". "Côte d’Ivoire" → "cote divoire".
export function normalizeCountryText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function buildIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  const add = (name: string, code: string) => {
    const key = normalizeCountryText(name);
    if (!key) return;
    const codes = index.get(key) ?? new Set<string>();
    codes.add(code);
    index.set(key, codes);
  };
  for (const { code, name } of ORIGIN_COUNTRIES) {
    add(name, code);
    // "Myanmar (Burma)" also answers to "Myanmar" and "Burma"; "Congo -
    // Kinshasa" and "Hong Kong SAR China" stay whole (aliases cover them).
    const paren = /^(.*?)\s*\((.*)\)$/.exec(name);
    if (paren) {
      add(paren[1], code);
      add(paren[2], code);
    }
  }
  for (const [alias, codes] of Object.entries(ALIASES)) {
    for (const code of codes) add(alias, code);
  }
  return index;
}

let index: Map<string, Set<string>> | null = null;

function lookup(text: string): string[] {
  index ??= buildIndex();
  const trimmed = text.trim();
  // A bare two-letter ISO code ("VN", "cn").
  if (/^[A-Za-z]{2}$/.test(trimmed) && ORIGIN_COUNTRY_CODES.includes(trimmed.toUpperCase())) {
    return [trimmed.toUpperCase()];
  }
  return [...(index.get(normalizeCountryText(trimmed)) ?? [])].sort();
}

export function matchOriginCountry(text: string | null | undefined): OriginMatch {
  if (text == null || text.trim() === "") return { kind: "empty" };

  const whole = lookup(text);
  if (whole.length === 1) return { kind: "match", code: whole[0] };
  if (whole.length > 1) return { kind: "ambiguous", candidates: whole };

  // "Shenzhen, China" or "Ho Chi Minh City / Vietnam": match only if the
  // parts name exactly one country between them.
  const parts = text.split(/[,;/|]|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { kind: "unknown" };
  const found = new Set<string>();
  let ambiguousPart = false;
  for (const part of parts) {
    const codes = lookup(part);
    if (codes.length > 1) ambiguousPart = true;
    for (const code of codes) found.add(code);
  }
  const candidates = [...found].sort();
  if (candidates.length === 1 && !ambiguousPart) return { kind: "match", code: candidates[0] };
  if (candidates.length > 0) return { kind: "ambiguous", candidates };
  return { kind: "unknown" };
}
