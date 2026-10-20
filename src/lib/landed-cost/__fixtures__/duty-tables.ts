import { readFileSync } from "node:fs";
import path from "node:path";
import type { DutyRow } from "@/lib/tariff/additional-duties";
import type { DutyProgramRow } from "@/lib/tariff/programs";
import { program } from "@/lib/tariff/__fixtures__/spec-builders";

// In-memory tables for the batch duty loader's tests, readable by both
// buildEstimate and loadSkuDuties through the shared Supabase stub. Rates are
// ILLUSTRATIVE unless they come from the seeded rows. Test-only.

type Row = Record<string, unknown>;

export const CALCULATED_ON = "2026-10-02";
export const RELEASE = { id: "rel-20", name: "2026HTSRev20", title: "Revision 20 (2026)", release_start_date: "2026-09-28", status: "current" };

export const htsLine = (code: string, general: string | null, other: string | null = "35%") => ({
  release_id: "rel-20",
  hts_code: code,
  description: `Line ${code}`,
  ancestor_descriptions: ["Heading"],
  units: ["kg"],
  general_rate: general,
  special_rate: null,
  other_rate: other,
});

// FY2027 fees, with end dates (buildEstimate reads them; the loader doesn't).
export const FEE_ROWS = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", effective_to: null, source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", effective_to: null, source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", effective_to: null, source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];

// The shipped polysilicon program row, read from its migration.
const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261020141702_tariff_polysilicon_232_warning.sql"),
  "utf8",
);
const seeded = /\('section_232_polysilicon', '([^']+)',\s*'([^']+)',\s*null, array\[([^\]]+)\], date '(\d{4}-\d{2}-\d{2})',/.exec(MIGRATION);
if (!seeded) throw new Error("polysilicon program row not found in its migration");

export const PROGRAMS: DutyProgramRow[] = [
  program("section_301_china", "Section 301 (China)", { trigger_origins: ["CN"], sort_order: 5 }),
  program("section_301_forced_labor", "Section 301 (forced labour)", { trigger_origins: ["CN", "VN"], indicative_rates: { CN: 12.5, VN: 12.5 }, sort_order: 10 }),
  program("section_232_metals", "Section 232 (steel, aluminium, copper)", { trigger_hts_prefixes: ["72", "73", "74", "76"], sort_order: 50 }),
  program("section_232_polysilicon", seeded[1], {
    warning_text: seeded[2],
    trigger_hts_prefixes: seeded[3].split(",").map((p) => p.trim().replace(/'/g, "")),
    trigger_from: seeded[4],
    sort_order: 105,
  }),
];

// additional_duties and additional_duty_scope rows from DutyRows (scope
// lines get ids in order).
export function dutyRowTables(rows: DutyRow[]): { additional_duties: Row[]; additional_duty_scope: Row[] } {
  let n = 0;
  return {
    additional_duties: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([key]) => key !== "scope"))),
    additional_duty_scope: rows.flatMap((r) =>
      r.scope.map((s) => ({
        id: `scope-${String(++n).padStart(6, "0")}`,
        duty_id: r.id,
        hts_prefix: s.hts_prefix,
        article_description: s.article_description,
        excluded: s.excluded ?? false,
      })),
    ),
  };
}

export const reviewedStatus = (programKey: string, at = "2026-09-20T09:00:00Z") => ({
  program_key: programKey,
  review_status: "reviewed",
  last_reviewed_at: at,
  last_reviewed_by: "user-dani",
});

export function dutyTables(extra: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    hts_releases: [RELEASE],
    hts_lines: [
      htsLine("6402993110", "6%"),
      htsLine("7208101500", "Free", "0.4¢/kg + 20%"),
      htsLine("8471300100", "Free"),
      htsLine("0805100020", "1.9¢/kg"),
      htsLine("0805100050", "1.9¢/kg"),
      htsLine("08053000", "2.2¢/kg"),
      htsLine("6115100500", "14.6%"),
      htsLine("6401100000", null, null),
      htsLine("2804610000", "Free"),
      htsLine("8504409540", "3.4%"),
      htsLine("8504409580", "10%"),
    ],
    customs_fees: FEE_ROWS,
    hts_column2_countries: [{ country_code: "RU", effective_from: "2022-04-09", effective_to: null }],
    duty_programs: PROGRAMS,
    fx_rates: [],
    additional_duties: [],
    additional_duty_scope: [],
    duty_program_review_status: [],
    hts_chapter99_changes: [],
    profiles: [{ id: "user-dani", email: "dani@test.local", first_name: "Dani" }],
    ...extra,
  } as Record<string, Row[]>;
}
