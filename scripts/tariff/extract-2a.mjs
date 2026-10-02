// Rebuilds the PR 2a seed data (origin-based Section 301: forced labour and
// Brazil) from the cached official sources:
//   npm run tariff:fetch && node scripts/tariff/extract-2a.mjs && npm run tariff:seed
// Writes data/tariff/2a-origin-301/{seed.json,scope.csv}.

import { readSource } from "./lib/sources.mjs";
import { writeSeedData } from "./lib/seed-data.mjs";
import { federalRegisterText } from "./lib/text.mjs";
import { note50Text, note52Text, originDuties } from "./parse/origin-301.mjs";

export const SEED_2A_DIR = "data/tariff/2a-origin-301";
const MIGRATION = "supabase/migrations/20261002151203_tariff_seed_origin_duties.sql";
const CHECKED_ON = "2026-10-02";

const HEADER = `-- Seed: origin-based additional duties (PR 2a), all PENDING EXPERT REVIEW.
-- Nothing here counts toward an estimate until a tariff editor marks the
-- program reviewed in Tariff Calculator > Duty data.
--
-- Sources (primary only, checked 2026-10-02):
--   Forced-labour Section 301: USTR notice FR 2026-15181 (U.S. note 52 text)
--     and the per-country headings 9903.05.20-9903.05.84 as published in
--     the 2026 HTS, Revision 20 (USITC).
--   Brazil Section 301: USTR notice FR 2026-14542 (U.S. note 50 text,
--     including its lists of subheadings).
-- Left out (not machine-readable in the Federal Register text, or not
-- decidable from an HTS code), for experts to add:
--   note 52(b) and Annex II Part A product list (9903.05.86); (d) civil
--   aircraft list (9903.05.88); (e) pharmaceutical-use list (9903.05.89);
--   (j)(1)-(13)(i) country product lists (9903.05.96-.99, 9903.06.02,
--   .04, .06, .07, .09, .10, .12, .14, .16, .18, .20); donations and
--   informational materials (9903.05.91/.92, 9903.05.08/.09); the expired
--   in-transit windows (9903.05.85, 9903.05.02); legal status (the
--   forced-labour action is challenged at the CIT; no primary source
--   loaded, so rows say in_force).
`;

const ch99 = JSON.parse(readSource("hts_ch99_export").bytes.toString("utf8"));
const note52 = note52Text(federalRegisterText(readSource("fr_2026_15181").bytes.toString("utf8")));
const note50 = note50Text(federalRegisterText(readSource("fr_2026_14542").bytes.toString("utf8")));

const duties = originDuties({ ch99, note52, note50, checkedOn: CHECKED_ON });
const result = writeSeedData(SEED_2A_DIR, { migration: MIGRATION, format: "2a", header: HEADER, duties });
console.log(`${SEED_2A_DIR}: ${result.duties} duty rows, ${result.scopeLines} scope lines`);
