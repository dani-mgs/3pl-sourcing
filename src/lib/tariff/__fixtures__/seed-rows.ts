import { readFileSync } from "node:fs";
import path from "node:path";
import type { DutyRow } from "../additional-duties";

// The seeded duty rows exactly as the seed migrations insert them, read from
// their data files (data/tariff/<seed>/), so tests run on the real lists.
// Test-only.

function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  const [header, ...rest] = records;
  return rest.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

type SeedDuty = Omit<DutyRow, "id" | "scope"> & { ref: string; notes: string | null };

export function seedRows(seedDir: string): DutyRow[] {
  const dir = path.join(process.cwd(), seedDir);
  const seed = JSON.parse(readFileSync(path.join(dir, "seed.json"), "utf8")) as { duties: SeedDuty[] };
  const scope = parseCsv(readFileSync(path.join(dir, "scope.csv"), "utf8"));
  const byRef = new Map<string, DutyRow["scope"]>();
  for (const line of scope) {
    const list = byRef.get(line.ref) ?? [];
    list.push({
      hts_prefix: line.hts_prefix,
      article_description: line.article_description || null,
      excluded: line.excluded === "true",
    });
    byRef.set(line.ref, list);
  }
  return seed.duties.map((d) => ({
    ...d,
    id: `${seedDir}:${d.ref}`,
    assume_condition: d.assume_condition ?? false,
    excludes_programs: d.excludes_programs ?? [],
    scope: byRef.get(d.ref) ?? [],
  }));
}
