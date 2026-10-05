// Browser-friendly source links for seeded duty rows. USITC serves the HTS
// chapter PDFs only as downloads (application/octet-stream), so a row's
// primary link is a web page (the HTS website's search for its heading, or
// the Federal Register notice it cites) and the PDF is a second, clearly
// labelled "Download" link with the page to open.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./sources.mjs";
import { q, arr } from "./seed-sql.mjs";

export const HTS_SEARCH_URL = "https://hts.usitc.gov/search?query=";

export function htsSearchUrl(heading) {
  return `${HTS_SEARCH_URL}${heading}`;
}

// "Download Chapter 99 PDF, 2026 Rev. 20 (14 MB) — see page 685 (99-III-513), heading 9903.88.01"
export function chapterPdfLabel({ revision, bytes, page, label, heading }) {
  const mb = Math.round(bytes / 1_000_000);
  return `Download Chapter 99 PDF, ${revision} (${mb} MB) — see page ${page}${label ? ` (${label})` : ""}, heading ${heading}`;
}

// links: [{ ref, program_key, chapter99_heading, effective_from, origin_countries,
//   old_source_url, source_url, source_document_url, source_document_label }]
export function writeSourceLinks(seedDir, { migration, header, links }) {
  const file = path.resolve(REPO_ROOT, seedDir, "source-links.json");
  writeFileSync(file, `${JSON.stringify({ migration, header, links }, null, 2)}\n`);
  return links.length;
}

export function readSourceLinks(seedDir) {
  try {
    return JSON.parse(readFileSync(path.resolve(REPO_ROOT, seedDir, "source-links.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// One UPDATE per row, matched on what identifies it (program, heading, start
// date, origins) and only while it still has the URL it was seeded with, so
// a link a tariff editor has already changed is left alone.
export function sourceLinksSql({ header, links }) {
  const updates = links.map(
    (l) => `update additional_duties
set source_url = ${q(l.source_url)},
  source_document_url = ${q(l.source_document_url)},
  source_document_label = ${q(l.source_document_label)}
where program_key = ${q(l.program_key)} and chapter99_heading = ${q(l.chapter99_heading)}
  and effective_from = ${q(l.effective_from)} and origin_countries is not distinct from ${arr(l.origin_countries)}
  and source_url = ${q(l.old_source_url)};
`,
  );
  return [header, ...updates].join("\n");
}
