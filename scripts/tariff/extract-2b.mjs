// Builds the PR 2b seed data (China Section 301 and Section 232 metals) from
// the cached official sources, cross-checks every list against a second
// source, and writes the reports reviewers work from:
//   data/tariff/2b-china301-232/{seed.json,scope.csv}
//   docs/tariff-data/2b-crosscheck.md      sources, counts, every mismatch
//   docs/tariff-data/2b-spot-check.{csv,md}  random sample + every mismatch
// Run: npm run tariff:fetch && npm run tariff:extract && npm run tariff:seed

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toCsv } from "./lib/csv.mjs";
import { dutyRef, writeSeedData } from "./lib/seed-data.mjs";
import { chapterPdfLabel, htsSearchUrl, writeSourceLinks } from "./lib/source-links.mjs";
import { REPO_ROOT, loadSources, readSource } from "./lib/sources.mjs";
import { docxText, federalRegisterText, pdfText } from "./lib/text.mjs";
import { chinaExclusions, chinaLists } from "./parse/china-301.mjs";
import { cbpMetalsList, frNote31, usitcChinaTable } from "./parse/crosscheck-sources.mjs";
import { headingLocation, notesLines } from "./parse/hts-notes.mjs";
import { note16Lists, note19Lists, note35Lists } from "./parse/metals-232.mjs";
import { EU } from "./parse/origin-301.mjs";
import { headingRates, sample } from "./parse/seed-helpers.mjs";

export const SEED_2B_DIR = "data/tariff/2b-china301-232";
const MIGRATION = "supabase/migrations/20261002234639_tariff_seed_china301_232.sql";
// Browser-friendly links for the rows above (seed.json keeps the URLs they
// were first loaded with; this later migration updates them).
const LINKS_MIGRATION = "supabase/migrations/20261005111624_tariff_seed_source_links.sql";
const CHECKED_ON = "2026-10-03";
const HTS_PDF_URL = "https://hts.usitc.gov/reststop/file?release=2026HTSRev20&filename=Chapter%2099";
const PROC_11021_URL =
  "https://www.federalregister.gov/documents/2026/04/09/2026-06960/strengthening-actions-taken-to-adjust-imports-of-aluminum-steel-and-copper-into-the-united-states";
const COLUMN_2 = ["BY", "CU", "KP", "RU"]; // general note 3(b), as in hts_column2_countries
const EXCL_15 = (p) => !/^(72|73|74|76)/.test(p); // note 16(c): outside chapters 72, 73, 74, 76
const CH_84_85_87 = (p) => /^(84|85|87)/.test(p);

// ---------------------------------------------------------------- sources
const sources = loadSources().sources;
const ch99 = JSON.parse(readSource("hts_ch99_export").bytes.toString("utf8"));
const rates = headingRates(ch99);
const lines = notesLines(await pdfText(readSource("hts_ch99_pdf").bytes));
const usitc = usitcChinaTable(await pdfText(readSource("usitc_china_tariffs").bytes));
const cbp = cbpMetalsList(await docxText(readSource("cbp_metals_list").bytes));
const fr31 = frNote31(readSource("fr_2024_21217").bytes.toString("utf8"), readSource("fr_2024_29462").bytes.toString("utf8"));
const frText = (id) => federalRegisterText(readSource(id).bytes.toString("utf8"));
const exclusionNotice = frText("fr_2025_21671");
const conforming = frText("fr_2026_17925");
const list3Rate = frText("fr_2019_09681");
const list4aRate = frText("fr_2020_00904");
const proc = frText("fr_2026_06960");
const procJune = frText("fr_2026_11314");

const china = chinaLists(lines);
const exclusions = chinaExclusions(lines);
const n16 = note16Lists(lines);
const n19 = note19Lists(lines);
const n35 = note35Lists(lines);

// Statements the seed relies on, each checked in its source.
const statements = [];
const state = (what, text, phrase, where) => {
  const found = text.includes(phrase);
  statements.push({ what, phrase, where, found });
  if (!found) throw new Error(`Source statement not found (${where}): ${phrase}`);
};
state("List 3 rate 25% from May 10, 2019", list3Rate, "increase to 25 percent with respect to products covered by the September 2018 action on May 10, 2019", "FR 2019-09681");
state("List 4A rate 7.5% from February 14, 2020", list4aRate, "February 14, 2020, the rate of additional duty will be 7.5 percent", "FR 2020-00904");
state("178 exclusions extended", exclusionNotice, "extend the 178 current exclusions", "FR 2025-21671");
state("Exclusions end before 11:59 p.m. EDT, November 9, 2026", exclusionNotice, "before 11:59 p.m. eastern daylight time on November 9, 2026", "FR 2025-21671");
state("232 duty on the full customs value", proc, "full customs value", "Proclamation 11021");
state("One 232 metal duty per article", proc, "shall only be subject once to the respective duty rates", "Proclamation 11021, clause (9)");
state("Russian aluminium stays at 200%", proc, "shall continue to be subject to the 200 percent", "Proclamation 11021, clause (8)");
state("U.S. content threshold 85% from June 8, 2026", procJune, "at least 85 percent of weight", "FR 2026-11314, clause (4)");
for (const [n, codes] of [["(4)", "8413.91.9039, 8413.91.9046, 8413.91.9059 or 8413.91.9099"], ["(iv)(4)", "3926.90.9915 or 3926.90.9920"]]) {
  state(`Exclusion ${n} renumbered from July 1, 2026`, conforming, codes, "FR 2026-17925");
}

// ---------------------------------------------------------------- rows
const duties = [];
const base = {
  chapter99_heading_at_minimum: null,
  condition_text: null,
  assume_condition: false,
  excludes_programs: [],
  exclusion_heading: null,
  effective_to: null,
  legal_status: "in_force",
  source_checked_on: CHECKED_ON,
  notes: null,
  hts_scope: "listed",
  lines: [],
};
const rateOf = (heading) => {
  const r = rates.get(heading);
  if (!r) throw new Error(`No rate text for ${heading} in the HTS export`);
  return r;
};
const dedupe = (ls) => {
  const seen = new Set();
  return ls.filter((l) => {
    const key = `${l.prefix}|${l.excluded ? 1 : 0}|${l.description ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// China Section 301 (origin CN). Rates are read from each heading's
// "Rates of Duty 1-General" text; the dates are when the current rate began.
const CHINA = [
  ["9903.88.01", "List 1", "2018-07-06", "U.S. note 20(a)-(b)", "25% since July 6, 2018 (heading effective date per USITC China Tariffs)."],
  ["9903.88.02", "List 2", "2018-08-23", "U.S. note 20(c)-(d)", "25% since August 23, 2018 (heading effective date per USITC China Tariffs)."],
  ["9903.88.03", "List 3", "2019-05-10", "U.S. note 20(e)-(f)", "25% since May 10, 2019 (FR 2019-09681); 10% from September 24, 2018."],
  ["9903.88.04", "List 3 (particular articles)", "2019-05-10", "U.S. note 20(g)", "25% since May 10, 2019 (FR 2019-09681). Covers the 8-digit subheading except the statistical numbers the note names."],
  ["9903.88.15", "List 4A", "2020-02-14", "U.S. note 20(r)-(s)", "7.5% since February 14, 2020 (FR 2020-00904); 15% from September 1, 2019."],
  ["9903.91.01", "Four-year review (25%)", "2024-09-27", "U.S. note 31(b)", null],
  ["9903.91.02", "Four-year review (50%)", "2024-09-27", "U.S. note 31(c)", null],
  ["9903.91.03", "Four-year review (100%)", "2024-09-27", "U.S. note 31(d)", null],
  ["9903.91.05", "Four-year review (50%)", "2025-01-01", "U.S. note 31(f)", "Note 31(f)(ii): the rate is to increase on June 23, 2027 (not loaded)."],
  ["9903.91.06", "Four-year review (25%)", "2026-01-01", "U.S. note 31(g)", null],
  ["9903.91.07", "Four-year review (50%)", "2026-01-01", "U.S. note 31(h)", null],
  ["9903.91.08", "Four-year review (100%)", "2026-01-01", "U.S. note 31(i)", null],
  ["9903.91.11", "Four-year review (25%)", "2025-01-01", "U.S. note 31(j)", null],
];
const cn = (d) =>
  duties.push({
    ...base,
    program_key: "section_301_china",
    authority: "section_301",
    origin_countries: ["CN"],
    filing_order: 5,
    source_url: HTS_PDF_URL,
    ...d,
  });
for (const [heading, label, from, note, notes] of CHINA) {
  const r = rateOf(heading);
  if (r.type !== "add") throw new Error(`${heading}: expected an added rate, got "${r.text}"`);
  cn({
    chapter99_heading: heading,
    label,
    rate_type: "add",
    rate_pct: r.pct,
    effective_from: from,
    source_label: `HTS heading ${heading} and ${note} (2026 Rev. 20)`,
    notes,
    lines: dedupe(china.lists[heading]),
  });
}
{
  const r = rateOf("9903.92.10");
  cn({
    chapter99_heading: "9903.92.10",
    label: "Ship-to-shore gantry cranes",
    rate_type: "add",
    rate_pct: r.pct,
    effective_from: "2024-09-27",
    condition_text:
      "the crane is a ship-to-shore gantry crane (high- or low-profile steel superstructure, designed to unload intermodal containers from vessels); other cranes of 8426.19.00 have no additional duty from this program (9903.92.80)",
    assume_condition: true,
    source_label: "HTS subheading 9903.92.10 (2026 Rev. 20)",
    notes: "Raising condition: the higher rate is assumed until the article is confirmed.",
    lines: [{ prefix: "84261900", location: "HTS 2026 Rev. 20, subheading 9903.92.10 (article description)" }],
  });
}
// Taking effect November 10, 2026 (suspended until then; 90 FR 48320, 90 FR
// 50947): loaded as unconfirmed, never counted.
for (const [heading, label, scope, condition] of [
  ["9903.91.12", "Intermodal chassis (from November 10, 2026)", china.chassis, "intermodal chassis, subassemblies and parts of China (U.S. note 31(k)(i)) are charged +100% from November 10, 2026 unless the suspension is extended"],
  ["9903.91.14", "Ship-to-shore gantry cranes (from November 10, 2026)", china.cranes, "ship-to-shore gantry cranes (U.S. note 31(l)) are charged +100% from November 10, 2026 unless the suspension is extended or an exception applies (9903.91.15/.16)"],
]) {
  cn({
    chapter99_heading: heading,
    label,
    rate_type: "unconfirmed",
    rate_pct: rateOf(heading).pct,
    effective_from: "2026-11-10",
    condition_text: condition,
    source_label: `HTS heading ${heading} and U.S. note 31 (2026 Rev. 20)`,
    notes: "Suspended until November 10, 2026 (USITC China Tariffs intro; 90 FR 48320, 90 FR 50947). For expert confirmation before it counts.",
    lines: dedupe(scope.map((l) => ({ ...l, description: heading === "9903.91.12" ? "Intermodal chassis, subassemblies thereof, and parts thereof" : null }))),
  });
}
// USTR product exclusions: never applied, only named (with their end date).
for (const heading of ["9903.88.69", "9903.88.70"]) {
  const items = exclusions.filter((e) => e.heading === heading);
  cn({
    chapter99_heading: heading,
    label: "USTR product exclusion",
    rate_type: "exempt",
    rate_pct: null,
    effective_from: heading === "9903.88.69" ? "2024-06-15" : "2024-01-01",
    effective_to: "2026-11-09",
    source_label: `HTS heading ${heading} and U.S. note ${heading === "9903.88.69" ? "20(vvv)" : "20(www)"} (2026 Rev. 20); extended through November 9, 2026 (FR 2025-21671)`,
    notes:
      "Exclusions depend on the product description, not only the HTS code, so they are never applied automatically. Each line carries the exclusion's text.",
    lines: dedupe(
      items.flatMap((e) =>
        e.codes.map((code) => ({
          prefix: code.replace(/\./g, ""),
          description: `${e.description ?? `the product of statistical reporting number ${code}`} (USTR exclusion, U.S. note ${e.ref}(${e.n}))`,
          location: e.location,
        })),
      ),
    ),
  });
}

// Section 232 metals (U.S. note 16; rows as of June 8, 2026).
const L = n16;
const union = (...subs) =>
  dedupe(subs.flatMap((s) => L[s]).map((l) => ({ prefix: l.prefix, location: l.location })));
const m232 = (d) =>
  duties.push({
    ...base,
    program_key: "section_232_metals",
    authority: "section_232",
    origin_countries: null,
    filing_order: 30,
    effective_from: "2026-06-08",
    source_url: HTS_PDF_URL,
    ...d,
  });
const UK_95 =
  "at least 95% of the aluminium was smelted or most recently cast, or at least 95% of the steel was melted and poured, in the United Kingdom (U.S. note 16(d))";
const US_85 =
  "at least 85% of the article's aluminium, steel or copper content was smelted and cast (melted and poured) in the United States (U.S. note 16(e))";
const add = (heading) => {
  const r = rateOf(heading);
  if (r.type !== "add") throw new Error(`${heading}: expected an added rate, got "${r.text}"`);
  return { rate_type: "add", rate_pct: r.pct };
};
const minimum = (heading, atMinimum) => {
  const r = rateOf(heading);
  if (r.type !== "total") throw new Error(`${heading}: expected a total rate, got "${r.text}"`);
  if (rateOf(atMinimum).type !== "none") throw new Error(`${atMinimum}: expected "No change"`);
  return { rate_type: "minimum_total", rate_pct: r.pct, chapter99_heading_at_minimum: atMinimum };
};
const src = (heading, subs) => `HTS heading ${heading} and U.S. note 16${subs} (2026 Rev. 20); Proclamation 11021 as adjusted June 8, 2026`;

m232({ chapter99_heading: "9903.82.02", label: "Articles of aluminium, steel and copper, and listed derivatives", ...add("9903.82.02"), source_label: src("9903.82.02", "(c)(i)-(v)"), lines: union("i", "ii", "iii", "iv", "v") });
m232({ chapter99_heading: "9903.82.09", label: "Derivative articles", ...add("9903.82.09"), source_label: src("9903.82.09", "(c)(vi)-(viii), (xi)"), lines: union("vi", "vii", "viii", "xi") });
m232({ chapter99_heading: "9903.82.10", label: "Derivative articles (agricultural and fixed industrial equipment)", ...minimum("9903.82.10", "9903.82.11"), source_label: src("9903.82.10", "(c)(ix)-(x), (f)"), notes: "Column 1 rate + additional = 15% (U.S. note 16(f)); nothing added when the column 1 rate is 15% or more (9903.82.11).", lines: union("ix", "x") });
m232({ chapter99_heading: "9903.82.12", label: "Derivative articles of Belarus, Cuba, North Korea and Russia", origin_countries: COLUMN_2, ...add("9903.82.12"), source_label: src("9903.82.12", "(c)(ix)-(x)"), lines: union("ix", "x") });
m232({ chapter99_heading: "9903.82.14", label: "Russia: articles of steel and copper", origin_countries: ["RU"], ...add("9903.82.14"), source_label: src("9903.82.14", "(c)(iii)-(v)"), lines: union("iii", "iv", "v") });
m232({ chapter99_heading: "9903.82.16", label: "Russia: derivative steel and copper articles", origin_countries: ["RU"], ...add("9903.82.16"), source_label: src("9903.82.16", "(c)(vii)-(viii), (xi)"), lines: union("vii", "viii", "xi") });
m232({ chapter99_heading: "9903.82.17", label: "Russia: derivative steel articles", origin_countries: ["RU"], ...add("9903.82.17"), source_label: src("9903.82.17", "(c)(x)"), lines: union("x") });

// Lowering facts: never assumed (the higher rate applies, the lower one is
// named "could be … if …"). Experts can flip assume_condition per row.
m232({ chapter99_heading: "9903.82.04", label: "United Kingdom (95% UK-melted/smelted)", origin_countries: ["GB"], ...add("9903.82.04"), condition_text: UK_95, source_label: src("9903.82.04", "(c)(i)-(iv), (d)"), lines: union("i", "ii", "iii", "iv") });
m232({ chapter99_heading: "9903.82.05", label: "United Kingdom derivatives (95% UK-melted/smelted)", origin_countries: ["GB"], ...add("9903.82.05"), condition_text: UK_95, source_label: src("9903.82.05", "(c)(vi)-(vii), (d)"), lines: union("vi", "vii") });
m232({ chapter99_heading: "9903.82.06", label: "U.S.-metal derivatives and copper articles", ...add("9903.82.06"), condition_text: US_85, source_label: src("9903.82.06", "(c)(ii), (iv), (vi)-(viii), (xi), (e)"), lines: union("ii", "iv", "vi", "vii", "viii", "xi") });
m232({ chapter99_heading: "9903.82.07", label: "U.S.-metal derivatives (agricultural and fixed industrial equipment)", ...minimum("9903.82.07", "9903.82.08"), condition_text: US_85, source_label: src("9903.82.07", "(c)(ix)-(x), (e)"), lines: union("ix", "x") });
m232({ chapter99_heading: "9903.82.15", label: "Russia: U.S.-metal derivatives and copper articles", origin_countries: ["RU"], ...add("9903.82.15"), condition_text: US_85, source_label: src("9903.82.15", "(c)(iv), (vii), (viii), (xi), (e)"), lines: union("iv", "vii", "viii", "xi") });
const agParts = dedupe(union("vi", "vii", "viii").filter((l) => CH_84_85_87(l.prefix)));
m232({ chapter99_heading: "9903.82.23", label: "Parts for agricultural or industrial equipment, U.S. metal", ...minimum("9903.82.23", "9903.82.24"), condition_text: `the part (chapters 84, 85 or 87) is used exclusively to manufacture agricultural, fixed industrial or mobile industrial equipment of U.S. note 16(c)(ix)-(xi), and ${US_85.replace(" (U.S. note 16(e))", "")} (U.S. note 16(k); not for Belarus, Cuba, North Korea or Russia)`, source_label: src("9903.82.23", "(k), (e)"), lines: agParts });
m232({ chapter99_heading: "9903.82.25", label: "Parts for agricultural or industrial equipment", ...minimum("9903.82.25", "9903.82.26"), condition_text: "the part (chapters 84, 85 or 87) is used exclusively to manufacture agricultural, fixed industrial or mobile industrial equipment of U.S. note 16(c)(ix)-(xi) (U.S. note 16(k); not for Belarus, Cuba, North Korea or Russia)", source_label: src("9903.82.25", "(k), (f)"), lines: agParts });

// Conditional exemptions (facts the calculator can't check): named, not applied.
const ex232 = (d) => m232({ rate_type: "exempt", rate_pct: null, ...d });
const outside72 = dedupe(Object.keys(L).flatMap((s) => L[s]).filter((l) => EXCL_15(l.prefix)).map((l) => ({ prefix: l.prefix, location: l.location })));
ex232({ chapter99_heading: "9903.82.03", label: "Metal under 15% of the article's weight", condition_text: "the aluminium, steel or copper listed for this provision is less than 15% of the article's weight (U.S. note 16(c); not for chapters 72, 73, 74 or 76)", source_label: "HTS heading 9903.82.03 and U.S. note 16(c) (2026 Rev. 20)", lines: outside72 });
ex232({ chapter99_heading: "9903.82.01", label: "No aluminium, steel or copper", condition_text: "the article contains no aluminium, steel or copper (U.S. note 16(c))", source_label: "HTS heading 9903.82.01 and U.S. note 16(c) (2026 Rev. 20)", notes: "Seeded for listed codes outside chapters 72, 73, 74 and 76 only; articles of those chapters are made of the metal.", lines: outside72 });
ex232({ chapter99_heading: "9903.82.13", label: "Motorcycle parts for U.S. manufacturing", condition_text: "the part (chapters 84, 85 or 87) is for use in manufacturing motorcycles in the United States (U.S. note 16(g))", source_label: "HTS heading 9903.82.13 and U.S. note 16(g) (2026 Rev. 20)", lines: dedupe(union("vi", "vii", "viii", "xi").filter((l) => CH_84_85_87(l.prefix))) });
ex232({ chapter99_heading: "9903.82.18", label: "USMCA steel under a Commerce allocation", origin_countries: ["CA", "MX"], condition_text: "the steel was melted and poured in Canada or Mexico, qualifies for USMCA and is within a Commerce allocation under Proclamation 10984 (U.S. note 16(h))", source_label: "HTS heading 9903.82.18 and U.S. note 16(h) (2026 Rev. 20)", lines: union("iii") });
ex232({ chapter99_heading: "9903.82.19", label: "USMCA aluminium under a Commerce allocation", origin_countries: ["CA", "MX"], condition_text: "the aluminium was smelted and cast in Canada or Mexico, qualifies for USMCA and is within a Commerce allocation under Proclamation 10984 (U.S. note 16(i))", source_label: "HTS heading 9903.82.19 and U.S. note 16(i) (2026 Rev. 20)", lines: union("i") });
ex232({ chapter99_heading: "9903.82.21", label: "USMCA derivative steel: U.S. content", origin_countries: ["CA", "MX"], condition_text: "it qualifies for USMCA: the U.S. content up to 40% of the value is then not dutiable, and the duty applies only to the rest (9903.82.20/.21, U.S. note 16(j))", source_label: "HTS headings 9903.82.20-.21 and U.S. note 16(j) (2026 Rev. 20)", lines: union("xi") });
for (const [heading, origin, list, name] of [["9903.96.01", "GB", n35.GB, "United Kingdom"], ["9903.96.02", "JP", n35.JP, "Japan"], ["9903.96.03", "TW", n35.TW, "Taiwan"]]) {
  ex232({ chapter99_heading: heading, label: `Civil aircraft articles of ${name}`, origin_countries: [origin], condition_text: `the article is a civil aircraft article meeting general note 6 (U.S. note 35${heading === "9903.96.01" ? "(a)" : heading === "9903.96.02" ? "(b)" : "(c)"})`, source_label: `HTS heading ${heading} and U.S. note 35 (2026 Rev. 20)`, lines: dedupe(list.map((l) => ({ prefix: l.prefix, location: l.location }))) });
}

// Russian aluminium (200%): definite for Russia; for other origins only if
// Russian-smelted or -cast aluminium was used (a raising fact: named only).
const RU_ALU = "any primary aluminium in the article was smelted in Russia, or the aluminium was cast in Russia";
for (const [heading, list, sub] of [["9903.85.67", n19.aluminum, "19(g)"], ["9903.85.68", n19.derivatives, "19(i)-(k)"]]) {
  const scope = dedupe(list.map((l) => ({ prefix: l.prefix, location: l.location })));
  m232({ chapter99_heading: heading, label: "Russia: aluminium", origin_countries: ["RU"], ...add(heading), source_label: `HTS heading ${heading} and U.S. note ${sub} (2026 Rev. 20); Proclamation 11021, clause (8)`, source_url: PROC_11021_URL, notes: "Scope per the heading text (U.S. note 19 lists); CBP's June 2026 list applies this heading to U.S. note 16 lists instead — see the cross-check report.", lines: scope });
  m232({ chapter99_heading: heading, label: "Russian-smelted or -cast aluminium", ...add(heading), condition_text: RU_ALU, source_label: `HTS heading ${heading} and U.S. note ${sub} (2026 Rev. 20)`, lines: scope });
}

// Unconfirmed: 9903.82.22's "15%" has no defining note text (total or added?).
{
  const r = rateOf("9903.82.22");
  m232({
    chapter99_heading: "9903.82.22",
    label: "Derivative steel (mobile industrial equipment) of listed countries",
    origin_countries: [...EU, "AR", "EC", "SV", "GT", "JP", "KR", "LI", "CH", "TW", "GB"].sort(),
    rate_type: "unconfirmed",
    rate_pct: r.pct,
    condition_text:
      "heading 9903.82.22 sets 15% for these countries, but no note says whether that is the total rate (column 1 included) or an additional 15%",
    source_label: "HTS heading 9903.82.22 (2026 Rev. 20)",
    notes: "Open item for experts: confirm whether 15% is a total or an additional rate.",
    lines: union("xi"),
  });
}

// ---------------------------------------------------------------- cross-checks
const mismatches = [];
const mismatch = (check, list, code, problem, primary, second) => mismatches.push({ check, list, code, problem, primary, second });

// A. China lists vs USITC China Tariffs.
const covers = (dutyLines, code) => {
  const d = code.replace(/\./g, "");
  const matching = dutyLines.filter((l) => d.startsWith(l.prefix)).sort((a, b) => b.prefix.length - a.prefix.length);
  return matching.length > 0 && !matching[0].excluded;
};
const chinaCheck = [];
const usitcBy = new Map();
for (const r of usitc.rows) usitcBy.set(r.heading, [...(usitcBy.get(r.heading) ?? []), r]);
for (const d of duties.filter((x) => x.program_key === "section_301_china" && x.rate_type === "add")) {
  const theirs = usitcBy.get(d.chapter99_heading) ?? [];
  const ours = d.lines;
  let onlyTheirs = 0;
  let onlyOurs = 0;
  for (const t of theirs) {
    if (!covers(ours, t.code)) {
      onlyTheirs++;
      mismatch("A", d.chapter99_heading, t.code, "listed by USITC, not covered by the note as extracted", "-", t.location);
    }
  }
  for (const l of ours) {
    const hit = theirs.some((t) => (l.excluded ? t.prefix === l.prefix : t.prefix.startsWith(l.prefix)));
    if (l.excluded && hit) {
      onlyOurs++;
      mismatch("A", d.chapter99_heading, l.prefix, "excepted by the note, but listed by USITC", l.location, "USITC China Tariffs");
    } else if (!l.excluded && !hit) {
      onlyOurs++;
      mismatch("A", d.chapter99_heading, l.prefix, "in the note, not listed by USITC", l.location, "USITC China Tariffs");
    }
  }
  chinaCheck.push({ heading: d.chapter99_heading, label: d.label, ours: ours.filter((l) => !l.excluded).length, excepted: ours.filter((l) => l.excluded).length, theirs: theirs.length, onlyTheirs, onlyOurs });
}
const usitcHeadings = [...usitcBy.keys()].filter((h) => !duties.some((d) => d.chapter99_heading === h));
for (const h of usitcHeadings) mismatch("A", h, "-", "heading listed by USITC but not seeded", "-", "USITC China Tariffs");

// B. U.S. note 31 vs the FR notices as implemented.
const note31Check = [];
for (const [heading, theirs] of Object.entries(fr31.subs)) {
  const ours = duties.find((d) => d.chapter99_heading === heading).lines.filter((l) => !l.excluded).map((l) => l.prefix);
  const t = theirs.map((x) => x.code.replace(/\./g, ""));
  const onlyOurs = ours.filter((c) => !t.includes(c));
  const onlyTheirs = t.filter((c) => !ours.includes(c));
  for (const c of onlyOurs) mismatch("B", heading, c, "in Rev. 20 note 31, not in the FR notices as amended", "HTS Rev. 20", "FR 2024-21217 / 2024-29462");
  for (const c of onlyTheirs) mismatch("B", heading, c, "in the FR notices as amended, not in Rev. 20 note 31", "HTS Rev. 20", "FR 2024-21217 / 2024-29462");
  note31Check.push({ heading, ours: ours.length, theirs: t.length, onlyOurs: onlyOurs.length, onlyTheirs: onlyTheirs.length });
}

// C. Section 232: each CBP section vs the rows seeded for those headings.
const metalsCheck = [];
for (const section of cbp) {
  const theirs = [...new Set(section.subs.flatMap((s) => s.codes).map((c) => c.replace(/\./g, "")))];
  if (theirs.length === 0) continue;
  const rows = duties.filter((d) => d.program_key === "section_232_metals" && section.headings.includes(d.chapter99_heading) && (d.chapter99_heading.startsWith("9903.85") ? d.origin_countries : true));
  const ours = [...new Set(rows.flatMap((d) => d.lines.map((l) => l.prefix)))];
  const onlyOurs = ours.filter((c) => !theirs.includes(c));
  const onlyTheirs = theirs.filter((c) => !ours.includes(c));
  const label = section.headings.join(", ");
  for (const c of onlyOurs) mismatch("C", label, c, rows.length ? "seeded from the HTS note, not in CBP's list for this heading" : "no seeded row for this heading", rows[0]?.lines.find((l) => l.prefix === c)?.location ?? "-", "CBP CSMS #68855869 list");
  for (const c of onlyTheirs) mismatch("C", label, c, "in CBP's list for this heading, not in the seeded scope", "-", "CBP CSMS #68855869 list");
  metalsCheck.push({ headings: label, seeded: rows.map((r) => r.chapter99_heading).join(", ") || "(none)", ours: ours.length, theirs: theirs.length, onlyOurs: onlyOurs.length, onlyTheirs: onlyTheirs.length });
}
// Per-subdivision counts, note 16 vs CBP (where CBP labels the subdivision).
// The CBP section that lists each whole subdivision (others list subsets,
// e.g. 9903.82.13's motorcycle parts); (v) is CBP's unlabelled copper list
// under 9903.82.02.
const FULL_LIST = { i: "9903.82.04", ii: "9903.82.04", iii: "9903.82.04", iv: "9903.82.04", v: "9903.82.02", vi: "9903.82.05", vii: "9903.82.05", viii: "9903.82.06", ix: "9903.82.07", x: "9903.82.07", xi: "9903.82.09" };
const subCounts = Object.entries(L).map(([sub, ls]) => {
  const section = cbp.find((s) => s.headings.includes(FULL_LIST[sub]));
  const list = sub === "v" ? section?.subs[4] : section?.subs.find((x) => x.roman === sub);
  return { sub, note: ls.length, cbp: list ? new Set(list.codes).size : "—", where: `${FULL_LIST[sub]}${sub === "v" ? " (copper)" : ` (${sub})`}` };
});

// D. One applying row per code: two rows of a program for the same origin
// group and the same HTS line would be a data conflict.
const conflicts = [];
const charging = duties.filter((d) => d.rate_type === "add" || d.rate_type === "minimum_total");
for (const program of ["section_301_china", "section_232_metals"]) {
  const rows = charging.filter((d) => d.program_key === program && !(d.condition_text && !d.assume_condition));
  const seen = new Map();
  for (const d of rows) {
    const originKey = d.origin_countries ? d.origin_countries.join(",") : "*";
    for (const l of d.lines.filter((x) => !x.excluded)) {
      const key = `${originKey}|${l.prefix}`;
      const other = seen.get(key);
      if (other && other.chapter99_heading !== d.chapter99_heading) {
        // Both cover the 8-digit line but one excepts statistical numbers
        // under it: the 10-digit number decides (no conflict there).
        const split = [other, d].some((r) => r.lines.some((x) => x.excluded && x.prefix.startsWith(l.prefix)));
        const rate = (r) => Number(r.rate_pct);
        const higher = rate(other) >= rate(d) ? other : d;
        conflicts.push({ program, code: l.prefix, headings: `${other.chapter99_heading} / ${d.chapter99_heading}`, origins: originKey, split, higher: higher.chapter99_heading });
      }
      seen.set(key, d);
    }
  }
}
for (const c of conflicts.filter((x) => !x.split)) {
  mismatch("D", c.headings, c.code, `two applying rows for the same line (${c.origins}); the calculator applies the higher (${c.higher}) and names the other`, "-", "-");
}

// ---------------------------------------------------------------- outputs
const header = `-- Seed: China Section 301 and Section 232 metals (PR 2b), all PENDING EXPERT
-- REVIEW. Nothing here counts toward an estimate until a tariff editor marks
-- the program reviewed in Tariff Calculator > Duty data.
--
-- Generated by scripts/tariff/extract-2b.mjs + generate-seeds.mjs from the
-- sources pinned in scripts/tariff/sources.json (checked ${CHECKED_ON}); do not
-- edit by hand. Lists: HTS 2026 Revision 20, chapter 99, U.S. notes 16, 19,
-- 20, 31 and 35. Cross-checks and every mismatch: docs/tariff-data/
-- 2b-crosscheck.md; spot-check sample: docs/tariff-data/2b-spot-check.md.
-- Left out, for experts: the 9903.91.05 increase due June 23, 2027; facts the
-- calculator can't check are conditional rows (named, never assumed when they
-- would lower the duty); 9903.82.22 and the November 10, 2026 China headings
-- are 'unconfirmed' rows (named, never counted).
`;
// Lines in code order (excluded numbers right after the code they qualify).
for (const d of duties) d.lines.sort((a, b) => a.prefix.localeCompare(b.prefix) || (a.description ?? "").localeCompare(b.description ?? ""));
const result = writeSeedData(SEED_2B_DIR, { migration: MIGRATION, format: "2b", header, duties });

// Source links a reviewer can open: the HTS website's search for the heading
// (or the Federal Register notice the row cites) as the primary link, and the
// Chapter 99 PDF, which USITC only serves as a download, as a labelled second
// link with the page where the heading's row is printed.
const pdfLink = (heading) => {
  const where = headingLocation(lines, heading);
  return {
    source_document_url: HTS_PDF_URL,
    source_document_label: chapterPdfLabel({
      revision: "2026 Rev. 20",
      bytes: sources.hts_ch99_pdf.bytes,
      page: where.page,
      label: where.label,
      heading,
    }),
  };
};
const links = duties.map((d) => ({
  ref: dutyRef(d),
  program_key: d.program_key,
  chapter99_heading: d.chapter99_heading,
  effective_from: d.effective_from,
  origin_countries: d.origin_countries ?? null,
  old_source_url: d.source_url,
  source_url: d.source_url === HTS_PDF_URL ? htsSearchUrl(d.chapter99_heading) : d.source_url,
  ...pdfLink(d.chapter99_heading),
}));
const linksHeader = `-- Browser-friendly source links for the China Section 301 and Section 232
-- metals rows (seeded in 20261002234639). USITC serves the HTS Chapter 99 PDF
-- only as a download, so each row's primary link becomes the HTS website's
-- search for its heading (or the Federal Register notice it cites), and the
-- PDF becomes a labelled download link with the page of the heading's row.
-- Changes no rates or scope, so programs keep their review status.
--
-- Generated by scripts/tariff/extract-2b.mjs + generate-seeds.mjs from
-- data/tariff/2b-china301-232/source-links.json; do not edit by hand. A row
-- whose link a tariff editor has already changed is left alone.
`;
writeSourceLinks(SEED_2B_DIR, { migration: LINKS_MIGRATION, header: linksHeader, links });

// Spot check: 25 codes from lists over 50 codes, 5 from smaller ones, plus
// every mismatch. Fixed seed so the sample is reproducible.
const spot = [];
const rateText = (d) =>
  d.rate_type === "exempt" ? (d.label === "USTR product exclusion" ? "exclusion (caveat only)" : "exemption if the condition holds (caveat only)") : d.rate_type === "minimum_total" ? `minimum total ${d.rate_pct}%` : d.rate_type === "unconfirmed" ? `unconfirmed (${d.rate_pct}%)` : `+${d.rate_pct}%`;
const lists = [
  ...duties.filter((d) => d.program_key === "section_301_china").map((d) => ({ name: `${d.chapter99_heading} ${d.label}`, duty: d, lines: d.lines })),
  ...Object.entries(L).map(([sub, ls]) => ({ name: `U.S. note 16(c)(${sub})`, duty: null, lines: ls })),
];
for (const list of lists) {
  const pool = list.lines.filter((l) => !l.excluded);
  const n = pool.length > 50 ? 25 : 5;
  for (const l of sample(pool, n, `${list.name}`)) {
    const covering = list.duty ? [list.duty] : duties.filter((d) => d.program_key === "section_232_metals" && d.lines.some((x) => x.prefix === l.prefix) && !d.condition_text && d.rate_type !== "unconfirmed");
    spot.push({
      kind: "sample",
      list: list.name,
      code: l.prefix,
      headings: covering.map((d) => `${d.chapter99_heading} ${rateText(d)}${d.origin_countries ? ` (${d.origin_countries.length > 3 ? `${d.origin_countries.length} origins` : d.origin_countries.join(", ")})` : ""}`).join("; "),
      primary_location: l.location,
      second_source: list.duty ? (list.duty.chapter99_heading.startsWith("9903.88.6") || list.duty.chapter99_heading.startsWith("9903.88.7") ? "count only (FR 2025-21671: 178)" : "USITC China Tariffs") : "CBP CSMS #68855869 list",
      problem: "",
    });
  }
}
for (const m of mismatches) {
  spot.push({ kind: "mismatch", list: `${m.check}: ${m.list}`, code: m.code, headings: "", primary_location: m.primary, second_source: m.second, problem: m.problem });
}
const docs = path.join(REPO_ROOT, "docs/tariff-data");
mkdirSync(docs, { recursive: true });

const md = [];
const table = (cols, rows) => {
  md.push(`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`);
  for (const r of rows) md.push(`| ${r.map((v) => String(v ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  md.push("");
};
const fmtCode = (p) => (p.length === 10 ? `${p.slice(0, 4)}.${p.slice(4, 6)}.${p.slice(6)}` : p.length === 8 ? `${p.slice(0, 4)}.${p.slice(4, 6)}.${p.slice(6)}` : p.length === 6 ? `${p.slice(0, 4)}.${p.slice(4)}` : p);

// The same rows as CSV, with a web page to look each code up on (the PDF
// location is the citation to check).
const SPOT_COLUMNS = ["kind", "list", "code", "headings", "primary_location", "web_lookup", "second_source", "problem"];
writeFileSync(
  path.join(docs, "2b-spot-check.csv"),
  toCsv(SPOT_COLUMNS, spot.map((r) => ({ ...r, web_lookup: /^\d{4,10}$/.test(r.code) ? htsSearchUrl(fmtCode(r.code)) : "" }))),
);

md.push("# PR 2b spot check: China Section 301 and Section 232 metals", "");
md.push(`Generated by \`scripts/tariff/extract-2b.mjs\` (sources checked ${CHECKED_ON}). For each list, a fixed-seed random sample (25 codes from lists over 50 codes, 5 from smaller ones), then every cross-check mismatch. Open the primary source at the page given and confirm the code is listed and the rate matches.`, "");
md.push(`Primary source: HTS 2026 Revision 20, chapter 99. [Download the Chapter 99 PDF (${Math.round(sources.hts_ch99_pdf.bytes / 1_000_000)} MB)](${HTS_PDF_URL}) — USITC serves it only as a download; open it at the PDF page given in each row (the printed page label is in parentheses). To look up a heading or an HTS line on the web, use the [HTS website search](${htsSearchUrl("9903.88.01")}) (it shows the current revision). Second sources: [USITC China Tariffs (PDF)](${sources.usitc_china_tariffs.url}); [CBP CSMS #68855869 metals list (Word download)](${sources.cbp_metals_list.url}).`, "");
md.push("A CSV with the same rows is in `2b-spot-check.csv`.", "");
for (const list of lists) {
  const rows = spot.filter((s) => s.kind === "sample" && s.list === list.name);
  if (rows.length === 0) continue;
  md.push(`## ${list.name}`, "");
  table(["Code", "Seeded as", "Primary source location", "Look up on the web", "Second source"], rows.map((r) => [fmtCode(r.code), r.headings, r.primary_location, `[HTS search](${htsSearchUrl(fmtCode(r.code))})`, r.second_source]));
}
md.push("## Every mismatch", "");
if (mismatches.length === 0) md.push("None.", "");
else table(["Check", "List / heading", "Code", "Problem", "Primary", "Second source"], mismatches.map((m) => [m.check, m.list, fmtCode(m.code), m.problem, m.primary, m.second]));
writeFileSync(path.join(docs, "2b-spot-check.md"), `${md.join("\n").trimEnd()}\n`);

// Cross-check report.
const rep = [];
const rtable = (cols, rows) => {
  rep.push(`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`);
  for (const r of rows) rep.push(`| ${r.map((v) => String(v ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  rep.push("");
};
rep.push("# PR 2b cross-check report", "");
rep.push(`Generated by \`scripts/tariff/extract-2b.mjs\` from the sources pinned in \`scripts/tariff/sources.json\` (checked ${CHECKED_ON}). Regenerate with \`npm run tariff:fetch && npm run tariff:extract\`. Mismatches are reported, never resolved silently; they go to the experts.`, "");
rep.push("## Sources", "");
// A link a reviewer can open in a browser: Federal Register notices on their
// web page (federalregister.gov/d/<document number>), and downloads labelled
// as such (the extraction itself uses the exact file pinned in sources.json).
const sourceLink = (src) => {
  const fr = /federalregister\.gov\/documents\/full_text\/\w+\/\d{4}\/\d{2}\/\d{2}\/(\d{4}-\d+)\./.exec(src.url);
  if (fr) return `[${src.title}](https://www.federalregister.gov/d/${fr[1]})`;
  if (src.url.includes("reststop/exportList")) return `${src.title} ([JSON download](${src.url}); on the web: [HTS website search](${htsSearchUrl("9903.88.01")}))`;
  if (src.url.includes("reststop/file")) return `${src.title} ([PDF download](${src.url}); on the web: [HTS website search](${htsSearchUrl("9903.88.01")}))`;
  if (src.url.endsWith(".docx")) return `${src.title} ([Word download](${src.url}))`;
  return `[${src.title}](${src.url})`;
};
rtable(["Source", "Used for", "Retrieved", "SHA-256"], Object.entries(sources).filter(([id]) => !["fr_2026_15181", "fr_2026_14542"].includes(id)).map(([, s]) => [sourceLink(s), s.used_for, s.retrieved_on, `\`${s.sha256.slice(0, 16)}…\``]));
rep.push("Why these: there is no official CSV or spreadsheet of the current lists. The HTS U.S. notes are the current legal text (Revision 20, effective 2026-09-28) and the only source with the \"except statistical number …\" rules, so they are primary; the USITC table, the USTR notices and CBP's list are the cross-checks. The Federal Register annexes of the original List 1-4A notices and of the 2026 metals proclamations are scanned images, so they can't be machine-read.", "");
rep.push("## Seed", "");
rtable(["Program", "Rows", "Scope lines"], ["section_301_china", "section_232_metals"].map((p) => [p, duties.filter((d) => d.program_key === p).length, duties.filter((d) => d.program_key === p).reduce((n, d) => n + d.lines.length, 0)]));
rtable(["Heading", "Program", "For", "Rate", "Origins", "From", "Until", "Condition (assumed?)", "Lines"], duties.map((d) => [d.chapter99_heading, d.program_key.replace("section_", ""), d.label, rateText(d), d.origin_countries ? (d.origin_countries.length > 4 ? `${d.origin_countries.length} origins` : d.origin_countries.join(", ")) : "any", d.effective_from, d.effective_to ?? "", d.condition_text ? (d.rate_type === "unconfirmed" ? "open item (never counted)" : d.assume_condition ? "yes (raises the duty)" : d.rate_type === "exempt" ? "no (named; the duty applies)" : "no (named; the higher rate applies)") : "", `${d.lines.filter((l) => !l.excluded).length}${d.lines.some((l) => l.excluded) ? ` (+${d.lines.filter((l) => l.excluded).length} excepted)` : ""}`]));
rep.push("## Counts stated in the sources", "");
rtable(["What", "Stated", "Extracted", "Agrees"], [
  ["U.S. note 31(b) items (compiler's note: \"(5) through (352)\")", china.stated["9903.91.01"], china.lists["9903.91.01"].length, china.stated["9903.91.01"] === china.lists["9903.91.01"].length ? "yes" : "NO"],
  ["USTR product exclusions in force (FR 2025-21671: \"the 178 current exclusions\")", 178, exclusions.length, exclusions.length === 178 ? "yes" : "NO"],
  ...subCounts.map((s) => [`U.S. note 16(c)(${s.sub}) codes vs CBP list, section ${s.where}`, s.cbp, s.note, s.cbp === s.note ? "yes" : "NO"]),
]);
rep.push("### Exclusions: 178 reconciled", "");
const exBy = {};
for (const e of exclusions) exBy[e.ref] = (exBy[e.ref] ?? 0) + 1;
rtable(["Subdivision", "Base heading", "Items"], Object.entries(exBy).map(([ref, n]) => [ref, exclusions.find((e) => e.ref === ref).list, n]));
rep.push(`(vvv)(i)-(iv) hold ${exclusions.filter((e) => e.heading === "9903.88.69").length} exclusions, the 164 extended in FR 2024-11904 (89 FR 46948) and since; (www) holds ${exclusions.filter((e) => e.heading === "9903.88.70").length}, the solar manufacturing equipment exclusions of FR 2024-21217 Annex B. ${exclusions.length} in all, as FR 2025-21671 states. The planning estimate of 185 came from a rough parse that ran past the end of (www): Revision 20 prints the start of note 21 as "(21)(a)" instead of "21. (a)", so it counted note 21's own items. The extractor ends (www) at "(21)(a)". Statistical numbers are those in force today: clauses ending "prior to <date>" or "<date> through <date>" are history (e.g. (vvv)(i)(4)-(6) and (vvv)(iv)(4) use the numbers FR 2026-17925 set from July 1, 2026).`, "");
rep.push("## A. China lists vs USITC China Tariffs (as of January 1, 2026)", "");
rtable(["Heading", "List", "Note lines", "Excepted", "USITC codes", "Only USITC", "Only note"], chinaCheck.map((c) => [c.heading, c.label, c.ours, c.excepted, c.theirs, c.onlyTheirs, c.onlyOurs]));
rep.push("USITC lists the covered 10-digit numbers where the note covers an 8-digit subheading \"except\" some statistical numbers; the comparison checks coverage both ways (every USITC code covered by the note as extracted, every note line listed by USITC, no excepted number listed by USITC). Not in the USITC table: 9903.91.12 and 9903.91.14 (suspended until November 10, 2026) and the exclusions.", "");
rep.push("## B. U.S. note 31 vs USTR's notices as implemented", "");
rep.push(`Note 31 as inserted by FR 2024-21217, with these amendments applied: ${fr31.applied.join("; ")}.`, "");
rtable(["Heading", "Rev. 20 note", "FR as amended", "Only Rev. 20", "Only FR"], note31Check.map((c) => [c.heading, c.ours, c.theirs, c.onlyOurs, c.onlyTheirs]));
rep.push("## C. Section 232 metals vs CBP CSMS #68855869 list (June 5, 2026)", "");
rtable(["CBP section", "Seeded rows", "Seeded lines", "CBP codes", "Only seeded", "Only CBP"], metalsCheck.map((c) => [c.headings, c.seeded, c.ours, c.theirs, c.onlyOurs, c.onlyTheirs]));
rep.push("CBP sections are compared with the union of the rows seeded for the same headings (for 9903.85.67/.68, the Russia-origin rows). The CBP list is dated June 5, 2026; Revision 20 is later, so a code only in one may be a later change.", "");
rep.push("## D. One applying row per line", "");
const splitConflicts = conflicts.filter((c) => c.split);
const realConflicts = conflicts.filter((c) => !c.split);
rep.push("U.S. note 16(a) makes the 232 metal headings mutually exclusive, and the China 301 lists don't overlap, so each HTS line should have one applying row per origin. When two rows of a program match equally, the calculator applies the higher rate and names the other (an estimate never understates because of a data question).", "");
if (splitConflicts.length > 0) {
  rep.push(`${splitConflicts.length} 8-digit lines are in two China lists, each \"except\" the other's statistical numbers, so the 10-digit number decides (an 8-digit code gets the higher rate and a note naming the other):`, "");
  rtable(["Code", "Headings", "Higher"], splitConflicts.map((c) => [fmtCode(c.code), c.headings, c.higher]));
}
rep.push(realConflicts.length === 0 ? "No other line has two applying rows." : `${realConflicts.length} lines have two applying rows for the same origin (open item; see the mismatch list, check D):`, "");
if (realConflicts.length > 0) rtable(["Code", "Headings", "Origins", "Applied (higher)"], realConflicts.map((c) => [fmtCode(c.code), c.headings, c.origins, c.higher]));
rep.push("## Rates", "");
rtable(["Heading", "HTS rate text (Rev. 20)", "Seeded"], duties.filter((d, i, a) => a.findIndex((x) => x.chapter99_heading === d.chapter99_heading) === i && rates.get(d.chapter99_heading)).map((d) => [d.chapter99_heading, rates.get(d.chapter99_heading).text, rateText(d)]));
rep.push("## Statements checked in the sources", "");
rtable(["Statement", "Source", "Found"], statements.map((s) => [s.what, s.where, s.found ? "yes" : "NO"]));
rep.push("## Every mismatch", "");
if (mismatches.length === 0) rep.push("None.", "");
else rtable(["Check", "List / heading", "Code", "Problem", "Primary", "Second source"], mismatches.map((m) => [m.check, m.list, fmtCode(m.code), m.problem, m.primary, m.second]));
rep.push("## Open items for experts", "");
for (const item of [
  "9903.82.22: confirm whether the 15% for the EU, Japan, Korea, Switzerland, Taiwan, UK, Argentina, Ecuador, El Salvador, Guatemala and Liechtenstein is a total or an additional rate (seeded as unconfirmed; those countries' note 16(c)(xi) articles show a warning).",
  "9903.85.67/.68 (Russian aluminium, 200%): the heading text points to U.S. note 19 lists; CBP's June 2026 list and Proclamation 11021 clause (8) point to the note 16 aluminium lists. Seeded per the heading text (see C).",
  "Filing order between China 301 and forced-labour 301: CBP says \"Section 301 first\" without ordering the two; shown China 301 first.",
  "9903.91.12 and 9903.91.14 (chassis, cranes) take effect November 10, 2026 unless the suspension is extended (unconfirmed rows).",
  "9903.91.05: note 31(f)(ii) says the rate increases on June 23, 2027; the new rate isn't stated (not loaded).",
  "Legal status: every row is seeded in_force; set litigation status from a court source if relevant.",
  "Russia: 15 lines are both on a U.S. note 19 aluminium derivative list (9903.85.68, 200%) and on a note 16 steel or copper list (9903.82.14/.16/.17); which applies (Proclamation 11021 clause (9): one metal duty) needs confirming. The calculator applies 200% and names the other (check D).",
  "U.S. note 16(g) and (k) limit motorcycle parts (9903.82.13) and equipment parts (9903.82.23-.26) to chapters 84, 85 and 87; CBP's list also includes 23 chapter 86 (railway) lines. Seeded per the note (these rows only ever lower the duty, as caveats).",
  "Rows start June 8, 2026 for Section 232 (the lists as adjusted then); entries before that aren't covered by these rows.",
]) rep.push(`- ${item}`);
writeFileSync(path.join(docs, "2b-crosscheck.md"), `${rep.join("\n").trimEnd()}\n`);

console.log(`${SEED_2B_DIR}: ${result.duties} duty rows, ${result.scopeLines} scope lines; ${mismatches.length} mismatches; ${conflicts.length} conflicts; ${spot.length} spot-check rows`);
