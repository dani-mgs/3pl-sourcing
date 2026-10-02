// Downloads the official sources into .cache/tariff-sources/ and checks each
// against the hash in sources.json. Exits non-zero when one changed.
//   npm run tariff:fetch                 download and check
//   npm run tariff:fetch -- --update     record new hashes (after review)
//   npm run tariff:fetch -- hts_ch99_pdf only these sources

import { fetchSources } from "./lib/sources.mjs";

const args = process.argv.slice(2);
const update = args.includes("--update");
const ids = args.filter((a) => !a.startsWith("--"));

const changed = await fetchSources({ ids: ids.length > 0 ? ids : null, update });
if (changed.length > 0 && !update) {
  console.error(`\n${changed.length} source(s) changed since the seeds were built: ${changed.join(", ")}.`);
  console.error("Regenerate the affected seeds, review the cross-check report, then record the new hashes with --update.");
  process.exit(1);
}
