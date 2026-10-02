// Turns a seed's data files (data/tariff/<seed>/seed.json + scope.csv) into
// its migration SQL. Pure and deterministic: the drift test regenerates every
// seed and compares it with the committed migration, byte for byte.
//
// seed.json: { migration, format, header, duties: [{ ref, ...additional_duties
// columns }] }. scope.csv: ref, hts_prefix, excluded, article_description,
// source_location (the last is for reviewers; not loaded).
//
// Formats: "2a" reproduces the PR 2a seed exactly (its column list); "2b"
// adds effective_to, assume_condition and excluded scope lines.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { REPO_ROOT } from "./sources.mjs";

export const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
export const arr = (xs) => (xs == null ? "null" : `array[${xs.map(q).join(",")}]`);
const textArray = (xs) => (xs.length === 0 ? "'{}'" : arr(xs));

export function readSeed(seedDir) {
  const dir = path.resolve(REPO_ROOT, seedDir);
  const seed = JSON.parse(readFileSync(path.join(dir, "seed.json"), "utf8"));
  const scope = parseCsv(readFileSync(path.join(dir, "scope.csv"), "utf8"));
  return { seed, scope };
}

function scopeByRef(scope) {
  const byRef = new Map();
  for (const line of scope) {
    const list = byRef.get(line.ref) ?? [];
    list.push({
      prefix: line.hts_prefix,
      description: line.article_description === "" ? null : line.article_description,
      excluded: line.excluded === "true",
    });
    byRef.set(line.ref, list);
  }
  return byRef;
}

function duty2a(d, lines) {
  let sql = `with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values (${q(d.program_key)}, ${q(d.authority)}, ${q(d.chapter99_heading)}, ${q(d.chapter99_heading_at_minimum)}, ${q(d.label)}, ${q(d.rate_type)},
    ${d.rate_pct ?? "null"}, ${arr(d.origin_countries)}, ${q(d.hts_scope)}, ${q(d.condition_text)}, ${textArray(d.excludes_programs)}, ${q(d.exclusion_heading)}, ${d.filing_order},
    ${q(d.effective_from)}, ${q(d.legal_status)}, ${q(d.source_label)}, ${q(d.source_url)}, ${q(d.source_checked_on)}, ${q(d.notes)})
  returning id
)`;
  if (lines.length > 0) {
    const values = lines.map((l) => `(${q(l.prefix)}, ${q(l.description)})`).join(",\n  ");
    sql += `\ninsert into additional_duty_scope (duty_id, hts_prefix, article_description)\nselect d.id, v.prefix, v.description from d, (values\n  ${values}\n) as v(prefix, description);\n`;
  } else {
    sql += "\nselect 1 from d;\n";
  }
  return sql;
}

function duty2b(d, lines) {
  let sql = `with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, assume_condition, excludes_programs, exclusion_heading,
    filing_order, effective_from, effective_to, legal_status, source_label, source_url, source_checked_on, notes)
  values (${q(d.program_key)}, ${q(d.authority)}, ${q(d.chapter99_heading)}, ${q(d.chapter99_heading_at_minimum)}, ${q(d.label)}, ${q(d.rate_type)},
    ${d.rate_pct ?? "null"}, ${arr(d.origin_countries)}, ${q(d.hts_scope)}, ${q(d.condition_text)}, ${d.assume_condition ? "true" : "false"}, ${textArray(d.excludes_programs)}, ${q(d.exclusion_heading)},
    ${d.filing_order}, ${q(d.effective_from)}, ${q(d.effective_to)}, ${q(d.legal_status)}, ${q(d.source_label)}, ${q(d.source_url)}, ${q(d.source_checked_on)}, ${q(d.notes)})
  returning id
)`;
  if (lines.length > 0) {
    const values = lines.map((l) => `(${q(l.prefix)}, ${q(l.description)}, ${l.excluded ? "true" : "false"})`).join(",\n  ");
    sql += `\ninsert into additional_duty_scope (duty_id, hts_prefix, article_description, excluded)\nselect d.id, v.prefix, v.description, v.excluded from d, (values\n  ${values}\n) as v(prefix, description, excluded);\n`;
  } else {
    sql += "\nselect 1 from d;\n";
  }
  return sql;
}

export function seedSql({ seed, scope }) {
  const byRef = scopeByRef(scope);
  const render = seed.format === "2a" ? duty2a : seed.format === "2b" ? duty2b : null;
  if (!render) throw new Error(`Unknown seed format ${seed.format}`);
  const known = new Set(seed.duties.map((d) => d.ref));
  for (const ref of byRef.keys()) if (!known.has(ref)) throw new Error(`scope.csv refers to unknown duty ${ref}`);
  const parts = [seed.header, ...seed.duties.map((d) => render(d, byRef.get(d.ref) ?? []))];
  return parts.join("\n") + (seed.trailer ?? "");
}
