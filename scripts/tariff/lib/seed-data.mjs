// Writes a seed's data files: seed.json (duty rows) and scope.csv (their HTS
// scope lines, with where each comes from). These are the reviewable output
// of extraction and the only input of the SQL generator.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toCsv } from "./csv.mjs";
import { REPO_ROOT } from "./sources.mjs";

const DUTY_FIELDS = [
  "ref",
  "program_key",
  "authority",
  "chapter99_heading",
  "chapter99_heading_at_minimum",
  "label",
  "rate_type",
  "rate_pct",
  "origin_countries",
  "hts_scope",
  "condition_text",
  "assume_condition",
  "excludes_programs",
  "exclusion_heading",
  "filing_order",
  "effective_from",
  "effective_to",
  "legal_status",
  "source_label",
  "source_url",
  "source_checked_on",
  "notes",
];

// One heading can have rows for different origins (e.g. a definite Russia
// row beside an any-origin conditional one), so the origin is part of the ref.
export function dutyRef(d) {
  return d.origin_countries && d.origin_countries.length <= 3
    ? `${d.chapter99_heading}@${d.origin_countries.join("-")}`
    : d.origin_countries
      ? `${d.chapter99_heading}@${d.origin_countries.length}`
      : d.chapter99_heading;
}

export function writeSeedData(seedDir, { migration, format, header, duties }) {
  const dir = path.resolve(REPO_ROOT, seedDir);
  mkdirSync(dir, { recursive: true });
  const refs = new Set();
  const scope = [];
  const rows = duties.map((d) => {
    const ref = dutyRef(d);
    if (refs.has(ref)) throw new Error(`Duplicate duty ref ${ref}`);
    refs.add(ref);
    for (const l of d.lines ?? []) {
      scope.push({
        ref,
        hts_prefix: l.prefix,
        excluded: l.excluded ? "true" : "",
        article_description: l.description ?? "",
        source_location: l.location ?? "",
      });
    }
    return Object.fromEntries(DUTY_FIELDS.map((f) => [f, f === "ref" ? ref : (d[f] ?? null)]));
  });
  writeFileSync(path.join(dir, "seed.json"), `${JSON.stringify({ migration, format, header, duties: rows }, null, 2)}\n`);
  writeFileSync(
    path.join(dir, "scope.csv"),
    toCsv(["ref", "hts_prefix", "excluded", "article_description", "source_location"], scope),
  );
  return { duties: rows.length, scopeLines: scope.length };
}
