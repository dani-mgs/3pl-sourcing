import type { DutyRow } from "../additional-duties";
import type { FeeRow } from "../calculate";
import type { DutyProgramRow } from "../programs";

// Builders for synthetic tariff data, shared by tests (moved unchanged from
// spec-cases.test.ts). Every rate here is ILLUSTRATIVE, not the HTS or the
// database. Fees are the FY2027 values: MPF 0.3464% (min $34.58, max
// $670.86), informal $2.77 up to $2,500, HMF 0.125% on ocean shipments only.
// Test-only.

export const FEES: FeeRow[] = [
  { fee_code: "mpf_formal", label: "MPF", rate_pct: 0.3464, min_usd: 34.58, max_usd: 670.86, flat_usd: null, applies_up_to_value_usd: null, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "mpf_informal", label: "MPF informal", rate_pct: null, min_usd: null, max_usd: null, flat_usd: 2.77, applies_up_to_value_usd: 2500, effective_from: "2026-10-01", source_label: "FR 2026-15530", source_url: "https://www.federalregister.gov/" },
  { fee_code: "hmf", label: "HMF", rate_pct: 0.125, min_usd: null, max_usd: null, flat_usd: null, applies_up_to_value_usd: null, effective_from: "1991-01-01", source_label: "19 CFR 24.24", source_url: "https://www.ecfr.gov/" },
];

export const program = (key: string, name: string, triggers: Partial<DutyProgramRow> = {}): DutyProgramRow => ({
  key, name, status: "not_loaded", warning_text: `${name} may apply.`, trigger_origins: null, trigger_hts_prefixes: null, trigger_from: null, ...triggers,
  indicative_rates: null, source_label: "Source", source_url: "https://www.federalregister.gov/", sort_order: 0,
});

let seq = 0;
export const row = (overrides: Partial<DutyRow>): DutyRow => ({
  id: `spec-${++seq}`, program_key: "section_301_china", chapter99_heading: "9903.88.03", chapter99_heading_at_minimum: null,
  label: "Illustrative", rate_type: "add", rate_pct: 25, origin_countries: ["CN"], hts_scope: "all", condition_text: null,
  assume_condition: false, excludes_programs: [], exclusion_heading: null, filing_order: 10, effective_from: "2020-01-01",
  effective_to: null, legal_status: "in_force", source_label: "Illustrative", source_url: "https://example.gov/",
  source_checked_on: "2026-10-02", scope: [], ...overrides,
});
