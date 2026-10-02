// Writes each seed's migration from its data files (data/tariff/*/).
//   npm run tariff:seed           write the migrations
//   npm run tariff:seed -- --check  only compare (exit 1 on drift)
// The same comparison runs in the test suite (seeds.test.mjs).

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/sources.mjs";
import { readSeed, seedSql } from "./lib/seed-sql.mjs";

export function seedDirs() {
  const root = path.join(REPO_ROOT, "data/tariff");
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, "seed.json")))
    .map((e) => path.join("data/tariff", e.name))
    .sort();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  let drift = 0;
  for (const dir of seedDirs()) {
    const data = readSeed(dir);
    const sql = seedSql(data);
    const target = path.join(REPO_ROOT, data.seed.migration);
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (current === sql) {
      console.log(`up to date  ${data.seed.migration}`);
    } else if (check) {
      drift++;
      console.error(`DRIFT       ${data.seed.migration} differs from ${dir}`);
    } else {
      writeFileSync(target, sql);
      console.log(`written     ${data.seed.migration}`);
    }
  }
  if (drift > 0) process.exit(1);
}
