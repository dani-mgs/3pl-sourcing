-- Seed: origin-based additional duties (PR 2a), all PENDING EXPERT REVIEW.
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

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.20', null, 'Algeria', 'add',
    12.5, array['DZ'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.20 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.21', null, 'Angola', 'add',
    12.5, array['AO'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.21 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.22', null, 'Argentina', 'add',
    10, array['AR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.22 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.23', null, 'Australia', 'add',
    12.5, array['AU'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.23 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.24', null, 'Bahamas', 'add',
    12.5, array['BS'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.24 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.25', null, 'Bahrain', 'add',
    12.5, array['BH'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.25 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.26', null, 'Bangladesh', 'add',
    10, array['BD'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.26 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.27', null, 'Brazil', 'add',
    12.5, array['BR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.27 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.28', null, 'Cambodia', 'add',
    10, array['KH'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.28 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.29', null, 'Canada', 'add',
    10, array['CA'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.29 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.30', null, 'Chile', 'add',
    12.5, array['CL'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.30 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.31', null, 'China', 'add',
    12.5, array['CN'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.31 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.32', null, 'Colombia', 'add',
    12.5, array['CO'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.32 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.33', null, 'Costa Rica', 'add',
    12.5, array['CR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.33 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.34', null, 'Dominican Republic', 'add',
    12.5, array['DO'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.34 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.35', null, 'Ecuador', 'add',
    10, array['EC'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.35 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.36', null, 'Egypt', 'add',
    12.5, array['EG'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.36 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.37', null, 'El Salvador', 'add',
    10, array['SV'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.37 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.40', null, 'Guatemala', 'add',
    10, array['GT'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.40 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.41', null, 'Guyana', 'add',
    12.5, array['GY'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.41 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.42', null, 'Honduras', 'add',
    10, array['HN'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.42 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.43', null, 'Hong Kong, China', 'add',
    12.5, array['HK'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.43 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.44', null, 'India', 'add',
    10, array['IN'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.44 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.45', null, 'Indonesia', 'add',
    10, array['ID'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.45 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.46', null, 'Iraq', 'add',
    12.5, array['IQ'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.46 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.47', null, 'Israel', 'add',
    12.5, array['IL'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.47 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.50', null, 'Jordan', 'add',
    10, array['JO'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.50 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.51', null, 'Kazakhstan', 'add',
    12.5, array['KZ'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.51 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.52', null, 'Kuwait', 'add',
    12.5, array['KW'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.52 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.53', null, 'Libya', 'add',
    12.5, array['LY'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.53 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.54', null, 'Malaysia', 'add',
    10, array['MY'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.54 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.55', null, 'Mexico', 'add',
    10, array['MX'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.55 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.56', null, 'Morocco', 'add',
    12.5, array['MA'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.56 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.57', null, 'New Zealand', 'add',
    12.5, array['NZ'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.57 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.58', null, 'Nicaragua', 'add',
    12.5, array['NI'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.58 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.59', null, 'Nigeria', 'add',
    12.5, array['NG'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.59 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.60', null, 'Norway', 'add',
    12.5, array['NO'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.60 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.61', null, 'Oman', 'add',
    12.5, array['OM'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.61 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.62', null, 'Pakistan', 'add',
    10, array['PK'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.62 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.63', null, 'Peru', 'add',
    12.5, array['PE'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.63 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.64', null, 'Philippines', 'add',
    12.5, array['PH'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.64 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.65', null, 'Qatar', 'add',
    12.5, array['QA'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.65 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.66', null, 'Russia', 'add',
    12.5, array['RU'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.66 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.67', null, 'Saudi Arabia', 'add',
    12.5, array['SA'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.67 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.68', null, 'Singapore', 'add',
    12.5, array['SG'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.68 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.69', null, 'South Africa', 'add',
    12.5, array['ZA'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.69 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.72', null, 'Sri Lanka', 'add',
    10, array['LK'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.72 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.77', null, 'Thailand', 'add',
    12.5, array['TH'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.77 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.78', null, 'Trinidad and Tobago', 'add',
    10, array['TT'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.78 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.79', null, 'Türkiye', 'add',
    12.5, array['TR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.79 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.80', null, 'United Arab Emirates', 'add',
    12.5, array['AE'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.80 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.81', null, 'United Kingdom', 'add',
    10, array['GB'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.81 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.82', null, 'Uruguay', 'add',
    12.5, array['UY'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.82 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.83', null, 'Venezuela', 'add',
    12.5, array['VE'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.83 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.84', null, 'Vietnam', 'add',
    12.5, array['VN'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS heading 9903.05.84 (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.39', '9903.05.38', 'EU member states', 'minimum_total',
    10, array['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS headings 9903.05.38/9903.05.39 and U.S. note 52(k), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', 'Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).')
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.49', '9903.05.48', 'Japan', 'minimum_total',
    12.5, array['JP'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS headings 9903.05.48/9903.05.49 and U.S. note 52(k), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', 'Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).')
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.71', '9903.05.70', 'South Korea', 'minimum_total',
    12.5, array['KR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS headings 9903.05.70/9903.05.71 and U.S. note 52(k), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', 'Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).')
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.74', '9903.05.73', 'Switzerland', 'minimum_total',
    12.5, array['CH'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS headings 9903.05.73/9903.05.74 and U.S. note 52(k), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', 'Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).')
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.76', '9903.05.75', 'Taiwan', 'minimum_total',
    10, array['TW'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.90', 10,
    '2026-07-24', 'in_force', 'HTS headings 9903.05.75/9903.05.76 and U.S. note 52(k), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', 'Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).')
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.87', null, 'Particular articles (any covered origin)', 'exempt',
    null, null, 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(c), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('08059001', 'Etrogs'),
  ('08119080', 'Tropical fruit, nesoi, frozen, whether or not previously steamed or boiled'),
  ('12073000', 'Castor oil seeds, for sowing'),
  ('12074000', 'Sesame seeds, whether or not broken, for sowing'),
  ('12075000', 'Mustard seeds, whether or not broken, for sowing'),
  ('12076000', 'Safflower (Carthamus tintorius) seeds, for sowing'),
  ('12079903', 'Other oil seeds and oleaginous fruits whether or not broken, including niger seeds, hemp seeds and seeds nesoi, for sowing'),
  ('19059010', 'Bread, pastry, cakes, biscuits and similar baked products, nesoi, and puddings, whether or not containing chocolate, fruit, nuts or confectionery, for religious purposes only'),
  ('19059090', 'Bakers'' wares, communion wafers, sealing wafers, rice paper and similar products, nesoi, for religious purposes only'),
  ('20089921', 'Acai'),
  ('20093160', 'Citrus juice of any single citrus fruit (other than orange, grapefruit or lime), of a Brix value not exceeding 20, concentrated, unfermented, except for lemon juice'),
  ('20098970', 'Coconut water or juice of acai'),
  ('20099040', 'Coconut water juice blends, not from concentrate, packaged for retail sale'),
  ('21069099', 'Acai preparations for the manufacture of beverages'),
  ('33012951', 'Essential oils other than those of citrus fruit, nesoi, for religious purposes only'),
  ('44123357', 'Eucalyptus plywood sheets not exceeding 6 mm in thickness, outer ply of specified nonconiferous wood including birch or walnut, surface covered beyond clear or transparent material')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.93', null, 'USMCA goods of Canada', 'exempt',
    null, array['CA'], 'all', 'the goods are entered free of duty under the USMCA (U.S. note 52(g))', '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52, FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.94', null, 'USMCA goods of Mexico', 'exempt',
    null, array['MX'], 'all', 'the goods are entered free of duty under the USMCA (U.S. note 52(h))', '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52, FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.05.95', null, 'CAFTA-DR textile and apparel goods', 'exempt',
    null, array['CR','DO','SV','GT','HN','NI'], 'all', 'the good is a textile or apparel good (general note 29(d)(v)) entered free of duty under CAFTA-DR (U.S. note 52(i))', '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52, FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.01', null, 'Particular articles of Malaysia', 'exempt',
    null, array['MY'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13019091', 'Boswellia'),
  ('15159081', 'Argan oil')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.03', null, 'Particular articles of Cambodia', 'exempt',
    null, array['KH'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13019091', 'Boswellia'),
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.05', null, 'Particular articles of Guatemala', 'exempt',
    null, array['GT'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13019091', 'Boswellia'),
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.08', null, 'Particular articles of El Salvador', 'exempt',
    null, array['SV'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.11', null, 'Particular articles of Argentina', 'exempt',
    null, array['AR'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella'),
  ('15159081', 'Argan oil')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.13', null, 'Particular articles of Bangladesh', 'exempt',
    null, array['BD'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('15159081', 'Argan oil')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.15', null, 'Particular articles of Taiwan', 'exempt',
    null, array['TW'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13019091', 'Boswellia'),
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella'),
  ('15159081', 'Argan oil')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.17', null, 'Particular articles of Indonesia', 'exempt',
    null, array['ID'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.19', null, 'Particular articles of Ecuador', 'exempt',
    null, array['EC'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_forced_labor', 'section_301', '9903.06.21', null, 'Particular articles of Jordan', 'exempt',
    null, array['JO'], 'listed', null, '{}', null, 10,
    '2026-07-24', 'in_force', 'U.S. note 52(j), FR 2026-15181', 'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('12119089', 'Psyllium seed husks'),
  ('13021991', 'Aloe, Tasmanian pepper, coconut and centella')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_brazil', 'section_301', '9903.05.01', null, 'Brazil', 'add',
    25, array['BR'], 'all', null, array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'], '9903.05.07', 10,
    '2026-07-22', 'in_force', 'HTS heading 9903.05.01 and U.S. note 50(a)(i), FR 2026-14542', 'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment', '2026-10-02', null)
  returning id
)
select 1 from d;

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_brazil', 'section_301', '9903.05.03', null, 'Listed subheadings', 'exempt',
    null, array['BR'], 'listed', null, '{}', null, 10,
    '2026-07-22', 'in_force', 'U.S. note 50(a)(ii), FR 2026-14542', 'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('02011005', null),
  ('09042273', null),
  ('27074000', null),
  ('28492010', null),
  ('40011000', null),
  ('75011000', null),
  ('02011010', null),
  ('09042276', null),
  ('27075000', null),
  ('28492020', null),
  ('40012100', null),
  ('75021000', null),
  ('02011050', null),
  ('09042280', null),
  ('27079100', null),
  ('28499030', null),
  ('40012200', null),
  ('75022000', null),
  ('02012002', null),
  ('09051000', null),
  ('27079910', null),
  ('28539010', null),
  ('40012900', null),
  ('75030000', null),
  ('02012004', null),
  ('09052000', null),
  ('27079920', null),
  ('28539090', null),
  ('40013000', null),
  ('75040000', null),
  ('02012006', null),
  ('09061100', null),
  ('27079940', null),
  ('29031905', null),
  ('41041120', null),
  ('75089050', null),
  ('02012010', null),
  ('09061900', null),
  ('27079951', null),
  ('29031910', null),
  ('41044150', null),
  ('79011100', null),
  ('02012030', null),
  ('09062000', null),
  ('27079955', null),
  ('29031930', null),
  ('41044910', null),
  ('79011210', null),
  ('02012050', null),
  ('09071000', null),
  ('27079959', null),
  ('29031960', null),
  ('41044950', null),
  ('79011250', null),
  ('02012080', null),
  ('09072000', null),
  ('27079990', null),
  ('29152930', null),
  ('41071120', null),
  ('79012000', null),
  ('02013002', null),
  ('09081100', null),
  ('27081000', null),
  ('29362100', null),
  ('41071220', null),
  ('79020000', null),
  ('02013004', null),
  ('09081200', null),
  ('27082000', null),
  ('29362200', null),
  ('43021960', null),
  ('79039030', null),
  ('02013006', null),
  ('09082100', null),
  ('27090010', null),
  ('29362300', null),
  ('44034100', null),
  ('79070060', null),
  ('02013010', null),
  ('09082220', null),
  ('27090020', null),
  ('29362401', null),
  ('44034200', null),
  ('80011000', null),
  ('02013030', null),
  ('09082240', null),
  ('27101215', null),
  ('29362500', null),
  ('44034902', null),
  ('80012000', null),
  ('02013050', null),
  ('09083100', null),
  ('27101218', null),
  ('29362600', null),
  ('44072100', null),
  ('80020000', null),
  ('02013080', null),
  ('09083200', null),
  ('27101225', null),
  ('29362700', null),
  ('44072200', null),
  ('80070050', null),
  ('02021005', null),
  ('09092100', null),
  ('27101245', null),
  ('29362800', null),
  ('44072301', null),
  ('81011000', null),
  ('02021010', null),
  ('09092200', null),
  ('27101290', null),
  ('29362910', null),
  ('44072500', null),
  ('81019700', null),
  ('02021050', null),
  ('09093100', null),
  ('27101906', null),
  ('29362916', null),
  ('44072600', null),
  ('81032000', null),
  ('02022002', null),
  ('09093200', null),
  ('27101911', null),
  ('29362920', null),
  ('44072700', null),
  ('81033000', null),
  ('02022004', null),
  ('09096100', null),
  ('27101916', null),
  ('29362950', null),
  ('44072800', null),
  ('81039100', null),
  ('02022006', null),
  ('09096200', null),
  ('27101924', null),
  ('29369001', null),
  ('44072902', null),
  ('81039900', null),
  ('02022010', null),
  ('09101100', null),
  ('27101925', null),
  ('29371100', null),
  ('4407990295', null),
  ('81041100', null),
  ('02022030', null),
  ('09101200', null),
  ('27101926', null),
  ('29371200', null),
  ('44083101', null),
  ('81041900', null),
  ('02022050', null),
  ('09102000', null),
  ('27101930', null),
  ('29371900', null),
  ('44083902', null),
  ('81042000', null),
  ('02022080', null),
  ('09103000', null),
  ('27101935', null),
  ('29372100', null),
  ('44092205', null),
  ('81043000', null),
  ('02023002', null),
  ('09109100', null),
  ('27101940', null),
  ('29372200', null),
  ('44092210', null),
  ('81049000', null),
  ('02023004', null),
  ('09109907', null),
  ('27101945', null),
  ('29372310', null),
  ('44092225', null),
  ('81052030', null),
  ('02023006', null),
  ('09109910', null),
  ('27101990', null),
  ('29372325', null),
  ('44092240', null),
  ('81052060', null),
  ('02023010', null),
  ('09109920', null),
  ('27102005', null),
  ('29372350', null),
  ('44092250', null),
  ('81052090', null),
  ('02023030', null),
  ('09109940', null),
  ('27102010', null),
  ('29372910', null),
  ('44092260', null),
  ('81053000', null),
  ('02023050', null),
  ('09109950', null),
  ('27102015', null),
  ('29372990', null),
  ('44092265', null),
  ('81059000', null),
  ('02023080', null),
  ('09109960', null),
  ('27102025', null),
  ('29375000', null),
  ('44092290', null),
  ('81061000', null),
  ('02061000', null),
  ('10039040', null),
  ('27109100', null),
  ('29379005', null),
  ('44123106', null),
  ('81069000', null),
  ('02062100', null),
  ('10083000', null),
  ('27109905', null),
  ('29379010', null),
  ('44123126', null),
  ('81082000', null),
  ('02062200', null),
  ('10084000', null),
  ('27109910', null),
  ('29379020', null),
  ('44123142', null),
  ('81083000', null),
  ('02062900', null),
  ('10086000', null),
  ('27109916', null),
  ('29379040', null),
  ('44123145', null),
  ('81089030', null),
  ('02102000', null),
  ('11062090', null),
  ('27109921', null),
  ('29379045', null),
  ('44123148', null),
  ('81089060', null),
  ('03023200', null),
  ('11063020', null),
  ('27109931', null),
  ('29379090', null),
  ('44123152', null),
  ('81101000', null),
  ('03023400', null),
  ('11081400', null),
  ('27109932', null),
  ('29391100', null),
  ('44123161', null),
  ('81102000', null),
  ('03024400', null),
  ('11081900', null),
  ('27109939', null),
  ('29391910', null),
  ('44123192', null),
  ('81109000', null),
  ('03024700', null),
  ('12030000', null),
  ('27109945', null),
  ('29391920', null),
  ('44124100', null),
  ('81110047', null),
  ('03027111', null),
  ('12079100', null),
  ('27109990', null),
  ('29391950', null),
  ('44125110', null),
  ('81110049', null),
  ('03027150', null),
  ('15131100', null),
  ('27111100', null),
  ('29392000', null),
  ('44125131', null),
  ('81122100', null),
  ('03028950', null),
  ('15131900', null),
  ('27111200', null),
  ('29393000', null),
  ('44125141', null),
  ('81122200', null),
  ('03032300', null),
  ('15211000', null),
  ('27111300', null),
  ('29394100', null),
  ('44125151', null),
  ('81122900', null),
  ('03038900', null),
  ('15219020', null),
  ('27111400', null),
  ('29394200', null),
  ('44129106', null),
  ('81124110', null),
  ('03043100', null),
  ('16025005', null),
  ('27111900', null),
  ('29394400', null),
  ('44129110', null),
  ('81124150', null),
  ('03061100', null),
  ('16025007', null),
  ('27112100', null),
  ('29394500', null),
  ('44129131', null),
  ('81124900', null),
  ('0409000005', null),
  ('16025008', null),
  ('27112900', null),
  ('29394903', null),
  ('44129141', null),
  ('81125900', null),
  ('05080000', null),
  ('16025021', null),
  ('27121000', null),
  ('29395900', null),
  ('44129151', null),
  ('81129210', null),
  ('07020020', null),
  ('16025060', null),
  ('27122000', null),
  ('29396200', null),
  ('46012240', null),
  ('81129230', null),
  ('07020040', null),
  ('16025090', null),
  ('27129010', null),
  ('29396300', null),
  ('46012280', null),
  ('81129240', null),
  ('07020060', null),
  ('18010000', null),
  ('27129020', null),
  ('29396900', null),
  ('46012290', null),
  ('81129260', null),
  ('07099905', null),
  ('18020000', null),
  ('27131100', null),
  ('29397200', null),
  ('46012940', null),
  ('81129265', null),
  ('07099910', null),
  ('18031000', null),
  ('27131200', null),
  ('29397900', null),
  ('46019301', null),
  ('81129910', null),
  ('07108015', null),
  ('18032000', null),
  ('27132000', null),
  ('29411010', null),
  ('46019305', null),
  ('81129920', null),
  ('07119030', null),
  ('18040000', null),
  ('27139000', null),
  ('29411020', null),
  ('46019320', null),
  ('81129991', null),
  ('07123200', null),
  ('18050000', null),
  ('27141000', null),
  ('29411030', null),
  ('46021205', null),
  ('8422409181', null),
  ('07123410', null),
  ('19030020', null),
  ('27149000', null),
  ('29411050', null),
  ('46021214', null),
  ('84713001', null),
  ('07123420', null),
  ('19030040', null),
  ('27150000', null),
  ('29412010', null),
  ('46021216', null),
  ('84714101', null),
  ('07133420', null),
  ('20019045', null),
  ('27160000', null),
  ('29412050', null),
  ('46021223', null),
  ('84714900', null),
  ('07133440', null),
  ('20059160', null),
  ('28012000', null),
  ('29413000', null),
  ('46021225', null),
  ('84715001', null),
  ('07141010', null),
  ('20060040', null),
  ('28042900', null),
  ('29414000', null),
  ('46021235', null),
  ('84716010', null),
  ('07141020', null),
  ('20079940', null),
  ('28045000', null),
  ('29415000', null),
  ('46021245', null),
  ('84716020', null),
  ('07144010', null),
  ('20079950', null),
  ('28046100', null),
  ('29419010', null),
  ('47031100', null),
  ('84716070', null),
  ('07144020', null),
  ('20081915', null),
  ('28046910', null),
  ('29419030', null),
  ('47031900', null),
  ('84716080', null),
  ('07144050', null),
  ('20082000', null),
  ('28046950', null),
  ('29419050', null),
  ('47032100', null),
  ('84716090', null),
  ('07144060', null),
  ('20083035', null),
  ('28048000', null),
  ('30012000', null),
  ('47032900', null),
  ('84717010', null),
  ('07145010', null),
  ('20089100', null),
  ('28049000', null),
  ('30019001', null),
  ('47041100', null),
  ('84717020', null),
  ('07145020', null),
  ('20089913', null),
  ('28051910', null),
  ('30021200', null),
  ('47041900', null),
  ('84717030', null),
  ('07145060', null),
  ('20089915', null),
  ('28051920', null),
  ('30021300', null),
  ('47042100', null),
  ('84717040', null),
  ('07149042', null),
  ('20089940', null),
  ('28051990', null),
  ('30021400', null),
  ('47042900', null),
  ('84717050', null),
  ('07149044', null),
  ('20089945', null),
  ('28053000', null),
  ('30021500', null),
  ('47050000', null),
  ('84717060', null),
  ('07149046', null),
  ('20089991', null),
  ('28111100', null),
  ('30024100', null),
  ('47061000', null),
  ('84717090', null),
  ('07149048', null),
  ('20091100', null),
  ('28111910', null),
  ('30024200', null),
  ('47062000', null),
  ('84718010', null),
  ('07149061', null),
  ('20091225', null),
  ('28112910', null),
  ('30024900', null),
  ('47063000', null),
  ('84718040', null),
  ('08011100', null),
  ('20091245', null),
  ('28112920', null),
  ('30025100', null),
  ('47069100', null),
  ('84718090', null),
  ('08011200', null),
  ('20091900', null),
  ('28121900', null),
  ('30025900', null),
  ('47069201', null),
  ('84719000', null),
  ('08011901', null),
  ('20093920', null),
  ('28139010', null),
  ('30029010', null),
  ('47069301', null),
  ('84733011', null),
  ('08012100', null),
  ('20094940', null),
  ('28152000', null),
  ('30029052', null),
  ('56072100', null),
  ('84733020', null),
  ('08012200', null),
  ('21011121', null),
  ('28161000', null),
  ('30031000', null),
  ('63090000', null),
  ('84733051', null),
  ('08013100', null),
  ('21011129', null),
  ('28164010', null),
  ('30032000', null),
  ('68029900', null),
  ('84733091', null),
  ('08013200', null),
  ('21011290', null),
  ('28164020', null),
  ('30033910', null),
  ('71031020', null),
  ('84861000', null),
  ('08024100', null),
  ('21012020', null),
  ('28170000', null),
  ('30033950', null),
  ('71031040', null),
  ('84862000', null),
  ('08024200', null),
  ('21069048', null),
  ('28181010', null),
  ('30034100', null),
  ('71069110', null),
  ('84863000', null),
  ('08026100', null),
  ('22029930', null),
  ('28181020', null),
  ('30034200', null),
  ('71081100', null),
  ('84864000', null),
  ('08026200', null),
  ('22029935', null),
  ('28182000', null),
  ('30034900', null),
  ('71081210', null),
  ('84869000', null),
  ('08027010', null),
  ('25041010', null),
  ('28183000', null),
  ('30039001', null),
  ('71081250', null),
  ('8505110070', null),
  ('08027020', null),
  ('25041050', null),
  ('28201000', null),
  ('30041010', null),
  ('71081310', null),
  ('85171300', null),
  ('08028010', null),
  ('25049000', null),
  ('28211000', null),
  ('30041050', null),
  ('71081355', null),
  ('85176200', null),
  ('08028020', null),
  ('25070000', null),
  ('28212000', null),
  ('30042000', null),
  ('71081370', null),
  ('85235100', null),
  ('08029110', null),
  ('25101000', null),
  ('28220000', null),
  ('30043100', null),
  ('71082000', null),
  ('85241110', null),
  ('08029190', null),
  ('25102000', null),
  ('28230000', null),
  ('30043200', null),
  ('71101100', null),
  ('85241190', null),
  ('08029210', null),
  ('25111010', null),
  ('28252000', null),
  ('30043900', null),
  ('71101900', null),
  ('85241200', null),
  ('08029290', null),
  ('25111050', null),
  ('28253000', null),
  ('30044100', null),
  ('71102100', null),
  ('85241900', null),
  ('08031010', null),
  ('25191000', null),
  ('28254000', null),
  ('30044200', null),
  ('71102900', null),
  ('85249110', null),
  ('08031020', null),
  ('25199010', null),
  ('28255030', null),
  ('30044900', null),
  ('71103100', null),
  ('85249190', null),
  ('08039000', null),
  ('25199020', null),
  ('28256000', null),
  ('30045010', null),
  ('71103900', null),
  ('85249200', null),
  ('08043020', null),
  ('25249000', null),
  ('28258000', null),
  ('30045020', null),
  ('71104100', null),
  ('85249900', null),
  ('08043040', null),
  ('25251000', null),
  ('28259015', null),
  ('30045030', null),
  ('71104900', null),
  ('85285200', null),
  ('08043060', null),
  ('25292100', null),
  ('28259020', null),
  ('30045040', null),
  ('71123001', null),
  ('8537109170', null),
  ('08044000', null),
  ('25292200', null),
  ('28259030', null),
  ('30045050', null),
  ('71129201', null),
  ('85411000', null),
  ('08045040', null),
  ('25302010', null),
  ('28259090', null),
  ('30046000', null),
  ('71159005', null),
  ('85412100', null),
  ('08045060', null),
  ('25302020', null),
  ('28261200', null),
  ('30049010', null),
  ('71159030', null),
  ('85412900', null),
  ('08045080', null),
  ('25309010', null),
  ('28263000', null),
  ('30049092', null),
  ('71189000', null),
  ('85413000', null),
  ('08051000', null),
  ('25309020', null),
  ('28269090', null),
  ('30063010', null),
  ('72011000', null),
  ('85414100', null),
  ('08055030', null),
  ('25309080', null),
  ('28273100', null),
  ('30063050', null),
  ('72012000', null),
  ('85414910', null),
  ('08055040', null),
  ('26011100', null),
  ('28273925', null),
  ('30066000', null),
  ('72015030', null),
  ('85414970', null),
  ('08072000', null),
  ('26011200', null),
  ('28273945', null),
  ('30069310', null),
  ('72015060', null),
  ('85414980', null),
  ('08084020', null),
  ('26020000', null),
  ('28273960', null),
  ('30069320', null),
  ('72021110', null),
  ('85414995', null),
  ('08084040', null),
  ('26030000', null),
  ('28273990', null),
  ('30069350', null),
  ('72021150', null),
  ('85415100', null),
  ('08105000', null),
  ('26040000', null),
  ('28274100', null),
  ('30069360', null),
  ('72021910', null),
  ('85415900', null),
  ('08106000', null),
  ('26050000', null),
  ('28274950', null),
  ('31010000', null),
  ('72021950', null),
  ('85419000', null),
  ('08109027', null),
  ('26060000', null),
  ('28275951', null),
  ('31021000', null),
  ('72023000', null),
  ('85423100', null),
  ('08109046', null),
  ('26080000', null),
  ('28276010', null),
  ('31022100', null),
  ('72024100', null),
  ('85423200', null),
  ('08119010', null),
  ('26090000', null),
  ('28276051', null),
  ('31022900', null),
  ('72024910', null),
  ('85423300', null),
  ('08119025', null),
  ('26100000', null),
  ('28332100', null),
  ('31023000', null),
  ('72024950', null),
  ('85423900', null),
  ('08119030', null),
  ('26110030', null),
  ('28332400', null),
  ('31024000', null),
  ('72025000', null),
  ('85429000', null),
  ('08119040', null),
  ('26110060', null),
  ('28332500', null),
  ('31025000', null),
  ('72026000', null),
  ('97012100', null),
  ('08119050', null),
  ('26121000', null),
  ('28332700', null),
  ('31026000', null),
  ('72028000', null),
  ('97012200', null),
  ('08119052', null),
  ('26122000', null),
  ('28332910', null),
  ('31028000', null),
  ('72029100', null),
  ('97012900', null),
  ('08129040', null),
  ('26139000', null),
  ('28332945', null),
  ('31029001', null),
  ('72029340', null),
  ('97019100', null),
  ('09011100', null),
  ('26140030', null),
  ('28332951', null),
  ('31031100', null),
  ('72029380', null),
  ('97019200', null),
  ('09011200', null),
  ('26140060', null),
  ('28342100', null),
  ('31031900', null),
  ('72029920', null),
  ('97019900', null),
  ('09012100', null),
  ('26159030', null),
  ('28342920', null),
  ('31039001', null),
  ('72031000', null),
  ('97021000', null),
  ('09012200', null),
  ('26159060', null),
  ('28342951', null),
  ('31042000', null),
  ('72039000', null),
  ('97029000', null),
  ('09019010', null),
  ('26161000', null),
  ('28366000', null),
  ('31043000', null),
  ('72042100', null),
  ('97031000', null),
  ('09019020', null),
  ('26171000', null),
  ('28369100', null),
  ('31049001', null),
  ('72043000', null),
  ('97039000', null),
  ('09021010', null),
  ('26203000', null),
  ('28369200', null),
  ('31051000', null),
  ('72044100', null),
  ('97040000', null),
  ('09021090', null),
  ('26209950', null),
  ('28369910', null),
  ('31052000', null),
  ('73141901', null),
  ('97051000', null),
  ('09022010', null),
  ('27011100', null),
  ('28369950', null),
  ('31053000', null),
  ('74010000', null),
  ('97052100', null),
  ('09022090', null),
  ('27011200', null),
  ('28391900', null),
  ('31054000', null),
  ('74020000', null),
  ('97052200', null),
  ('09023000', null),
  ('27011900', null),
  ('28418000', null),
  ('31055100', null),
  ('74031100', null),
  ('97052900', null),
  ('09024000', null),
  ('27012000', null),
  ('28419020', null),
  ('31055900', null),
  ('74031200', null),
  ('97053100', null),
  ('09030000', null),
  ('27021000', null),
  ('28441010', null),
  ('31056000', null),
  ('74031300', null),
  ('97053900', null),
  ('09041100', null),
  ('27022000', null),
  ('28441020', null),
  ('31059000', null),
  ('74031900', null),
  ('97061000', null),
  ('09041200', null),
  ('27030000', null),
  ('28442000', null),
  ('32041720', null),
  ('74032100', null),
  ('97069000', null),
  ('09042120', null),
  ('27040000', null),
  ('28443020', null),
  ('32061100', null),
  ('74032200', null),
  ('09042140', null),
  ('27050000', null),
  ('28443050', null),
  ('32061900', null),
  ('74032901', null),
  ('09042160', null),
  ('27060000', null),
  ('28461000', null),
  ('33011200', null),
  ('74040030', null),
  ('09042180', null),
  ('27071000', null),
  ('28469020', null),
  ('33019050', null),
  ('74040060', null),
  ('09042220', null),
  ('27072000', null),
  ('28469040', null),
  ('36069030', null),
  ('74050010', null),
  ('09042240', null),
  ('27073000', null),
  ('28469080', null),
  ('38180000', null),
  ('74050060', null)
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_brazil', 'section_301', '9903.05.04', null, 'Particular articles', 'exempt',
    null, array['BR'], 'listed', null, '{}', null, 10,
    '2026-07-22', 'in_force', 'U.S. note 50(a)(iii), FR 2026-14542', 'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('08059001', 'Etrogs'),
  ('08119080', 'Tropical fruit, nesoi, frozen, whether or not previously steamed or boiled'),
  ('14049090', 'Date palm branches, Myrtus branches or other vegetable material, for religious purposes only'),
  ('19059010', 'Bread, pastry, cakes, biscuits and similar baked products nesoi, and puddings, whether or not containing chocolate, fruit, nuts or confectionery, for religious purposes only'),
  ('19059090', 'Bakers'' wares, communion wafers, sealing wafers, rice paper and similar products, nesoi, for religious purposes only'),
  ('20089921', 'Acai'),
  ('20093160', 'Citrus juice of any single citrus fruit (other than orange, grapefruit or lime), of a Brix value not exceeding 20, concentrated, unfermented, except for lemon juice'),
  ('20098970', 'Coconut water or juice of acai'),
  ('20099040', 'Coconut water juice blends, not from concentrate, packaged for retail sale'),
  ('21069099', 'Acai preparations for the manufacture of beverages'),
  ('33012951', 'Essential oils other than those of citrus fruit, nesoi, for religious purposes only')
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_brazil', 'section_301', '9903.05.05', null, 'Civil aircraft and parts', 'exempt',
    null, array['BR'], 'listed', 'the article is a civil aircraft, or an engine, part, component, subassembly or ground flight simulator of one, meeting general note 6 (U.S. note 50(a)(iv))', '{}', null, 10,
    '2026-07-22', 'in_force', 'U.S. note 50(a)(iv), FR 2026-14542', 'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('39172100', null),
  ('76081000', null),
  ('84212900', null),
  ('85023900', null),
  ('85299055', null),
  ('90258050', null),
  ('39172200', null),
  ('76082000', null),
  ('84213100', null),
  ('85024000', null),
  ('85299063', null),
  ('90259006', null),
  ('39172300', null),
  ('83021060', null),
  ('84213200', null),
  ('85041000', null),
  ('85299068', null),
  ('90261020', null),
  ('39172900', null),
  ('83021090', null),
  ('84213901', null),
  ('85043120', null),
  ('85299073', null),
  ('90261040', null),
  ('39173100', null),
  ('83022000', null),
  ('84241000', null),
  ('85043140', null),
  ('85299077', null),
  ('90261060', null),
  ('39173300', null),
  ('83024230', null),
  ('84251100', null),
  ('85043160', null),
  ('85299078', null),
  ('90262040', null),
  ('39173900', null),
  ('83024260', null),
  ('84251900', null),
  ('85043200', null),
  ('85299081', null),
  ('90262080', null),
  ('39174000', null),
  ('83024940', null),
  ('84253101', null),
  ('85043300', null),
  ('85299083', null),
  ('90268020', null),
  ('39269045', null),
  ('83024960', null),
  ('84253901', null),
  ('85044040', null),
  ('85299087', null),
  ('90268040', null),
  ('39269094', null),
  ('83024980', null),
  ('84254200', null),
  ('85044060', null),
  ('85299088', null),
  ('90268060', null),
  ('39269096', null),
  ('83026030', null),
  ('84254900', null),
  ('85044070', null),
  ('85299089', null),
  ('90269020', null),
  ('39269099', null),
  ('83071030', null),
  ('84269900', null),
  ('85044085', null),
  ('85299093', null),
  ('90269040', null),
  ('40082920', null),
  ('83079030', null),
  ('84281000', null),
  ('85044095', null),
  ('85299095', null),
  ('90269060', null),
  ('40091200', null),
  ('84071000', null),
  ('84282000', null),
  ('85045040', null),
  ('85299097', null),
  ('90291080', null),
  ('40092200', null),
  ('84089090', null),
  ('84283300', null),
  ('85045080', null),
  ('85299098', null),
  ('90292040', null),
  ('40093200', null),
  ('84091000', null),
  ('84283900', null),
  ('85071000', null),
  ('85311000', null),
  ('90299080', null),
  ('40094200', null),
  ('84111140', null),
  ('84289003', null),
  ('85072080', null),
  ('85312000', null),
  ('90301000', null),
  ('40113000', null),
  ('84111180', null),
  ('84433100', null),
  ('85073080', null),
  ('85318015', null),
  ('90302005', null),
  ('40121300', null),
  ('84111240', null),
  ('84433210', null),
  ('85075000', null),
  ('85318090', null),
  ('90302010', null),
  ('40122010', null),
  ('84111280', null),
  ('84433250', null),
  ('85076000', null),
  ('85367000', null),
  ('90303100', null),
  ('40161000', null),
  ('84112140', null),
  ('84798910', null),
  ('85078082', null),
  ('85391000', null),
  ('90303200', null),
  ('40169350', null),
  ('84112180', null),
  ('84798920', null),
  ('85079040', null),
  ('85395100', null),
  ('90303334', null),
  ('40169935', null),
  ('84112240', null),
  ('84798965', null),
  ('85079080', null),
  ('85437042', null),
  ('90303338', null),
  ('40169960', null),
  ('84112280', null),
  ('84798970', null),
  ('85111000', null),
  ('85437045', null),
  ('90303901', null),
  ('40170000', null),
  ('84118140', null),
  ('84798995', null),
  ('85112000', null),
  ('85437060', null),
  ('90304000', null),
  ('45049000', null),
  ('84118240', null),
  ('84799041', null),
  ('85113000', null),
  ('85437080', null),
  ('90308400', null),
  ('48239010', null),
  ('84119110', null),
  ('84799045', null),
  ('85114000', null),
  ('85437091', null),
  ('90308901', null),
  ('48239020', null),
  ('84119190', null),
  ('84799055', null),
  ('85115000', null),
  ('85437095', null),
  ('90309025', null),
  ('48239031', null),
  ('84119910', null),
  ('84799065', null),
  ('85118020', null),
  ('85439012', null),
  ('90309046', null),
  ('48239040', null),
  ('84119990', null),
  ('84799075', null),
  ('85118040', null),
  ('85439015', null),
  ('90309066', null),
  ('48239050', null),
  ('84121000', null),
  ('84799085', null),
  ('85118060', null),
  ('85439035', null),
  ('90309068', null),
  ('48239060', null),
  ('84122100', null),
  ('84799095', null),
  ('85142040', null),
  ('85439065', null),
  ('90309084', null),
  ('48239067', null),
  ('84122940', null),
  ('84831010', null),
  ('85168040', null),
  ('85439068', null),
  ('90309089', null),
  ('48239070', null),
  ('84122980', null),
  ('84831030', null),
  ('85168080', null),
  ('85439085', null),
  ('90318040', null),
  ('48239080', null),
  ('84123100', null),
  ('84831050', null),
  ('85171400', null),
  ('85439088', null),
  ('90318080', null),
  ('48239086', null),
  ('84123900', null),
  ('84833040', null),
  ('85176100', null),
  ('85443000', null),
  ('90319021', null),
  ('68128090', null),
  ('84128010', null),
  ('84833080', null),
  ('85176900', null),
  ('88010000', null),
  ('90319045', null),
  ('68129910', null),
  ('84128090', null),
  ('84834010', null),
  ('85177100', null),
  ('88021101', null),
  ('90319054', null),
  ('68129920', null),
  ('84129090', null),
  ('84834030', null),
  ('85181040', null),
  ('88021201', null),
  ('90319059', null),
  ('68129990', null),
  ('84131900', null),
  ('84834050', null),
  ('85181080', null),
  ('88022001', null),
  ('90319070', null),
  ('68132000', null),
  ('84132000', null),
  ('84834070', null),
  ('85182100', null),
  ('88023001', null),
  ('90319091', null),
  ('68138100', null),
  ('84133010', null),
  ('84834080', null),
  ('85182200', null),
  ('88024001', null),
  ('90321000', null),
  ('68138900', null),
  ('84133090', null),
  ('84834090', null),
  ('85182940', null),
  ('88052900', null),
  ('90322000', null),
  ('70072111', null),
  ('84135000', null),
  ('84835040', null),
  ('85182980', null),
  ('88061000', null),
  ('90328100', null),
  ('73043130', null),
  ('84136000', null),
  ('84835060', null),
  ('85183010', null),
  ('88062100', null),
  ('90328920', null),
  ('73043160', null),
  ('84137010', null),
  ('84835090', null),
  ('85183020', null),
  ('88062200', null),
  ('90328940', null),
  ('73043900', null),
  ('84137020', null),
  ('84836040', null),
  ('85184010', null),
  ('88062300', null),
  ('90328960', null),
  ('73044130', null),
  ('84138100', null),
  ('84836080', null),
  ('85184020', null),
  ('88062400', null),
  ('90329021', null),
  ('73044160', null),
  ('84139110', null),
  ('84839010', null),
  ('85185000', null),
  ('88062900', null),
  ('90329041', null),
  ('73044900', null),
  ('84139120', null),
  ('84839020', null),
  ('85198110', null),
  ('88069100', null),
  ('90329061', null),
  ('73045110', null),
  ('84139190', null),
  ('84839030', null),
  ('85198120', null),
  ('88069200', null),
  ('90330090', null),
  ('73045150', null),
  ('84141000', null),
  ('84839050', null),
  ('85198125', null),
  ('88069300', null),
  ('91040005', null),
  ('73045910', null),
  ('84142000', null),
  ('84839080', null),
  ('85198130', null),
  ('88069400', null),
  ('91040010', null),
  ('73045920', null),
  ('84143040', null),
  ('84841000', null),
  ('85198141', null),
  ('88069900', null),
  ('91040020', null),
  ('73045960', null),
  ('84143080', null),
  ('84849000', null),
  ('85198910', null),
  ('88071000', null),
  ('91040025', null),
  ('73045980', null),
  ('84145130', null),
  ('85012050', null),
  ('85198920', null),
  ('88072000', null),
  ('91040030', null),
  ('73049010', null),
  ('84145190', null),
  ('85012060', null),
  ('85198930', null),
  ('88073000', null),
  ('91040040', null),
  ('73049030', null),
  ('84145930', null),
  ('85013150', null),
  ('85211030', null),
  ('88079090', null),
  ('91040045', null),
  ('73049050', null),
  ('84145965', null),
  ('85013160', null),
  ('85211060', null),
  ('90019040', null),
  ('91040050', null),
  ('73049070', null),
  ('84148005', null),
  ('85013181', null),
  ('85211090', null),
  ('90019050', null),
  ('91040060', null),
  ('73063010', null),
  ('84148016', null),
  ('85013220', null),
  ('85229025', null),
  ('90019060', null),
  ('91091050', null),
  ('73063030', null),
  ('84148020', null),
  ('85013255', null),
  ('85229036', null),
  ('90019080', null),
  ('91091060', null),
  ('73063050', null),
  ('84148090', null),
  ('85013261', null),
  ('85229045', null),
  ('90019090', null),
  ('91099020', null),
  ('73064010', null),
  ('84149010', null),
  ('85013320', null),
  ('85229058', null),
  ('90029020', null),
  ('94011040', null),
  ('73064050', null),
  ('84149030', null),
  ('85013330', null),
  ('85229065', null),
  ('90029040', null),
  ('94011080', null),
  ('73065010', null),
  ('84149041', null),
  ('85013361', null),
  ('85229080', null),
  ('90029070', null),
  ('94032000', null),
  ('73065030', null),
  ('84149091', null),
  ('85013461', null),
  ('85261000', null),
  ('90029085', null),
  ('94037040', null),
  ('73065050', null),
  ('84151060', null),
  ('85014050', null),
  ('85269100', null),
  ('90029095', null),
  ('94037080', null),
  ('73066110', null),
  ('84151090', null),
  ('85014060', null),
  ('85269210', null),
  ('90141010', null),
  ('94051140', null),
  ('73066130', null),
  ('84158101', null),
  ('85015150', null),
  ('85269250', null),
  ('90141060', null),
  ('94051160', null),
  ('73066150', null),
  ('84158201', null),
  ('85015160', null),
  ('85284200', null),
  ('90141070', null),
  ('94051180', null),
  ('73066170', null),
  ('84158300', null),
  ('85015240', null),
  ('85286200', null),
  ('90141090', null),
  ('94051940', null),
  ('73066910', null),
  ('84159040', null),
  ('85015280', null),
  ('85291021', null),
  ('90142020', null),
  ('94051960', null),
  ('73066930', null),
  ('84159080', null),
  ('85015340', null),
  ('85291040', null),
  ('90142040', null),
  ('94051980', null),
  ('73066950', null),
  ('84181000', null),
  ('85015360', null),
  ('85291091', null),
  ('90142060', null),
  ('94056120', null),
  ('73066970', null),
  ('84183000', null),
  ('85016101', null),
  ('85299004', null),
  ('90142080', null),
  ('94056140', null),
  ('73121005', null),
  ('84184000', null),
  ('85016201', null),
  ('85299005', null),
  ('90149010', null),
  ('94056160', null),
  ('73121010', null),
  ('84186101', null),
  ('85016301', null),
  ('85299006', null),
  ('90149020', null),
  ('94056920', null),
  ('73121020', null),
  ('84186901', null),
  ('85017100', null),
  ('85299009', null),
  ('90149040', null),
  ('94056940', null),
  ('73121030', null),
  ('84195010', null),
  ('85017210', null),
  ('85299013', null),
  ('90149060', null),
  ('94056960', null),
  ('73121050', null),
  ('84195050', null),
  ('85017220', null),
  ('85299016', null),
  ('90200040', null),
  ('94059200', null),
  ('73121060', null),
  ('84198150', null),
  ('85017230', null),
  ('85299019', null),
  ('90200060', null),
  ('94059920', null),
  ('73121070', null),
  ('84198190', null),
  ('85017290', null),
  ('85299021', null),
  ('90251120', null),
  ('94059940', null),
  ('73121080', null),
  ('84199010', null),
  ('85018010', null),
  ('85299024', null),
  ('90251140', null),
  ('96200050', null),
  ('73121090', null),
  ('84199020', null),
  ('85018020', null),
  ('85299029', null),
  ('90251940', null),
  ('96200060', null),
  ('73129000', null),
  ('84199030', null),
  ('85018030', null),
  ('85299033', null),
  ('90251980', null),
  ('73229000', null),
  ('84199050', null),
  ('85021100', null),
  ('85299036', null),
  ('90258010', null),
  ('73241000', null),
  ('84199085', null),
  ('85021200', null),
  ('85299039', null),
  ('90258015', null),
  ('73249000', null),
  ('84211900', null),
  ('85021300', null),
  ('85299043', null),
  ('90258020', null),
  ('73262000', null),
  ('84212100', null),
  ('85022000', null),
  ('85299046', null),
  ('90258035', null),
  ('74130090', null),
  ('84212300', null),
  ('85023100', null),
  ('85299049', null),
  ('90258040', null)
) as v(prefix, description);

with d as (
  insert into additional_duties (program_key, authority, chapter99_heading, chapter99_heading_at_minimum, label, rate_type,
    rate_pct, origin_countries, hts_scope, condition_text, excludes_programs, exclusion_heading, filing_order,
    effective_from, legal_status, source_label, source_url, source_checked_on, notes)
  values ('section_301_brazil', 'section_301', '9903.05.06', null, 'Pharmaceutical-use articles', 'exempt',
    null, array['BR'], 'listed', 'the article is for use in pharmaceutical applications (U.S. note 50(a)(v))', '{}', null, 10,
    '2026-07-22', 'in_force', 'U.S. note 50(a)(v), FR 2026-14542', 'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment', '2026-10-02', null)
  returning id
)
insert into additional_duty_scope (duty_id, hts_prefix, article_description)
select d.id, v.prefix, v.description from d, (values
  ('28041000', null),
  ('29071910', null),
  ('29182250', null),
  ('29231000', null),
  ('29332910', null),
  ('29349930', null),
  ('28043000', null),
  ('29071920', null),
  ('29182310', null),
  ('29232010', null),
  ('29332920', null),
  ('29349939', null),
  ('28061000', null),
  ('29071940', null),
  ('29182330', null),
  ('29232020', null),
  ('29332935', null),
  ('29349944', null),
  ('28070000', null),
  ('29071980', null),
  ('29182350', null),
  ('29233000', null),
  ('29332943', null),
  ('29349947', null),
  ('28092000', null),
  ('29072990', null),
  ('29182920', null),
  ('29234000', null),
  ('29332945', null),
  ('29349970', null),
  ('28111200', null),
  ('29081910', null),
  ('29182922', null),
  ('29239001', null),
  ('29332960', null),
  ('29349990', null),
  ('28112250', null),
  ('29081935', null),
  ('29182965', null),
  ('29241100', null),
  ('29332990', null),
  ('29355000', null),
  ('28121200', null),
  ('29081960', null),
  ('29182975', null),
  ('29241200', null),
  ('29333100', null),
  ('29359006', null),
  ('28141000', null),
  ('29089912', null),
  ('29183010', null),
  ('29241911', null),
  ('29333301', null),
  ('29359010', null),
  ('28142000', null),
  ('29089915', null),
  ('29183015', null),
  ('29241980', null),
  ('29333400', null),
  ('29359013', null),
  ('28151100', null),
  ('29089925', null),
  ('29183025', null),
  ('29242116', null),
  ('29333500', null),
  ('29359015', null),
  ('28151200', null),
  ('29091100', null),
  ('29183030', null),
  ('29242120', null),
  ('29333600', null),
  ('29359020', null),
  ('28153000', null),
  ('29091918', null),
  ('29183070', null),
  ('29242145', null),
  ('29333700', null),
  ('29359029', null),
  ('28251000', null),
  ('29091960', null),
  ('29183090', null),
  ('29242150', null),
  ('29333908', null),
  ('29359030', null),
  ('28273965', null),
  ('29092000', null),
  ('29189905', null),
  ('29242370', null),
  ('29333910', null),
  ('29359032', null),
  ('28276020', null),
  ('29093040', null),
  ('29189930', null),
  ('29242375', null),
  ('29333920', null),
  ('29359033', null),
  ('28321000', null),
  ('29093060', null),
  ('29189943', null),
  ('29242400', null),
  ('29333921', null),
  ('29359042', null),
  ('28323010', null),
  ('29094905', null),
  ('29189947', null),
  ('29242500', null),
  ('29333923', null),
  ('29359048', null),
  ('28331150', null),
  ('29094910', null),
  ('29189950', null),
  ('29242901', null),
  ('29333925', null),
  ('29359060', null),
  ('28331900', null),
  ('29094915', null),
  ('29191000', null),
  ('29242903', null),
  ('29333927', null),
  ('29359075', null),
  ('28332200', null),
  ('29094920', null),
  ('29199030', null),
  ('29242905', null),
  ('29333931', null),
  ('29359095', null),
  ('28341010', null),
  ('29094960', null),
  ('29199050', null),
  ('29242910', null),
  ('29333941', null),
  ('29381000', null),
  ('28352200', null),
  ('29095020', null),
  ('29201940', null),
  ('29242923', null),
  ('29333961', null),
  ('29389000', null),
  ('28352400', null),
  ('29095040', null),
  ('29201950', null),
  ('29242926', null),
  ('29333992', null),
  ('29394300', null),
  ('28362000', null),
  ('29095045', null),
  ('29202100', null),
  ('29242928', null),
  ('29334100', null),
  ('29395100', null),
  ('28363000', null),
  ('29095050', null),
  ('29202200', null),
  ('29242933', null),
  ('29334908', null),
  ('29396100', null),
  ('28364020', null),
  ('29101000', null),
  ('29202300', null),
  ('29242957', null),
  ('29334910', null),
  ('29398000', null),
  ('28372051', null),
  ('29103000', null),
  ('29202400', null),
  ('29242962', null),
  ('29334915', null),
  ('29400060', null),
  ('28419040', null),
  ('29104000', null),
  ('29202900', null),
  ('29242965', null),
  ('29334917', null),
  ('29420003', null),
  ('28421000', null),
  ('29105000', null),
  ('29203000', null),
  ('29242971', null),
  ('29334920', null),
  ('29420005', null),
  ('28429090', null),
  ('29109010', null),
  ('29209020', null),
  ('29242977', null),
  ('29334926', null),
  ('29420010', null),
  ('28432901', null),
  ('29109020', null),
  ('29209051', null),
  ('29242980', null),
  ('29334930', null),
  ('29420035', null),
  ('28433000', null),
  ('29109091', null),
  ('29211100', null),
  ('29242995', null),
  ('29334960', null),
  ('29420050', null),
  ('28439000', null),
  ('29110010', null),
  ('29211400', null),
  ('29251200', null),
  ('29334970', null),
  ('30033100', null),
  ('28444100', null),
  ('29110050', null),
  ('29211911', null),
  ('29251942', null),
  ('29335210', null),
  ('30034300', null),
  ('28444200', null),
  ('29121950', null),
  ('29211961', null),
  ('29251991', null),
  ('29335290', null),
  ('30036000', null),
  ('28444300', null),
  ('29122960', null),
  ('29212900', null),
  ('29252100', null),
  ('29335300', null),
  ('30044300', null),
  ('28444400', null),
  ('29124926', null),
  ('29213010', null),
  ('29252910', null),
  ('29335400', null),
  ('30067000', null),
  ('28452000', null),
  ('29126000', null),
  ('29213030', null),
  ('29252918', null),
  ('29335500', null),
  ('30069200', null),
  ('28453000', null),
  ('29141110', null),
  ('29213050', null),
  ('29252920', null),
  ('29335910', null),
  ('30069380', null),
  ('28459001', null),
  ('29141900', null),
  ('29214110', null),
  ('29252960', null),
  ('29335915', null),
  ('32030080', null),
  ('28470000', null),
  ('29142930', null),
  ('29214120', null),
  ('29252970', null),
  ('29335918', null),
  ('32041360', null),
  ('28500050', null),
  ('29142950', null),
  ('29214265', null),
  ('29252990', null),
  ('29335921', null),
  ('32041380', null),
  ('28531000', null),
  ('29143990', null),
  ('29214290', null),
  ('29263010', null),
  ('29335922', null),
  ('32041800', null),
  ('28539050', null),
  ('29144040', null),
  ('29214340', null),
  ('29264000', null),
  ('29335936', null),
  ('32049000', null),
  ('29011040', null),
  ('29144090', null),
  ('29214560', null),
  ('29269014', null),
  ('29335946', null),
  ('34013010', null),
  ('29021900', null),
  ('29145010', null),
  ('29214590', null),
  ('29269043', null),
  ('29335953', null),
  ('34024210', null),
  ('29029030', null),
  ('29145030', null),
  ('29214600', null),
  ('29269048', null),
  ('29335959', null),
  ('34024220', null),
  ('29031200', null),
  ('29145050', null),
  ('29214938', null),
  ('29269050', null),
  ('29335970', null),
  ('34024290', null),
  ('29031300', null),
  ('29146200', null),
  ('29214943', null),
  ('29270040', null),
  ('29335980', null),
  ('34025011', null),
  ('29032200', null),
  ('29146921', null),
  ('29214945', null),
  ('29270050', null),
  ('29335985', null),
  ('35079070', null),
  ('29034110', null),
  ('29146990', null),
  ('29214950', null),
  ('29280010', null),
  ('29335995', null),
  ('38021000', null),
  ('29034210', null),
  ('29147100', null),
  ('29215940', null),
  ('29280015', null),
  ('29336950', null),
  ('38085940', null),
  ('29034310', null),
  ('29147910', null),
  ('29215980', null),
  ('29280025', null),
  ('29336960', null),
  ('38085950', null),
  ('29034410', null),
  ('29147940', null),
  ('29221100', null),
  ('29280030', null),
  ('29337200', null),
  ('38086150', null),
  ('29034510', null),
  ('29147960', null),
  ('29221200', null),
  ('29280050', null),
  ('29337904', null),
  ('38089410', null),
  ('29034610', null),
  ('29147990', null),
  ('29221400', null),
  ('29299005', null),
  ('29337908', null),
  ('38089450', null),
  ('29034710', null),
  ('29152100', null),
  ('29221500', null),
  ('29299015', null),
  ('29337915', null),
  ('38123100', null),
  ('29034800', null),
  ('29152400', null),
  ('29221600', null),
  ('29299020', null),
  ('29337920', null),
  ('38151100', null),
  ('29034900', null),
  ('29152950', null),
  ('29221700', null),
  ('29299050', null),
  ('29337930', null),
  ('38151200', null),
  ('29035110', null),
  ('29153200', null),
  ('29221800', null),
  ('29301001', null),
  ('29337940', null),
  ('38159050', null),
  ('29035910', null),
  ('29153600', null),
  ('29221909', null),
  ('29302020', null),
  ('29337985', null),
  ('38248100', null),
  ('29035990', null),
  ('29153910', null),
  ('29221920', null),
  ('29302090', null),
  ('29339100', null),
  ('38248210', null),
  ('29036910', null),
  ('29153931', null),
  ('29221933', null),
  ('29303060', null),
  ('29339901', null),
  ('38248290', null),
  ('29036990', null),
  ('29153935', null),
  ('29221960', null),
  ('29304000', null),
  ('29339902', null),
  ('38248300', null),
  ('29037101', null),
  ('29153940', null),
  ('29221970', null),
  ('29306000', null),
  ('29339905', null),
  ('38248400', null),
  ('29037700', null),
  ('29153945', null),
  ('29221990', null),
  ('29307000', null),
  ('29339906', null),
  ('38248500', null),
  ('29037800', null),
  ('29153947', null),
  ('29221996', null),
  ('29309029', null),
  ('29339908', null),
  ('38248600', null),
  ('29037990', null),
  ('29153970', null),
  ('29222110', null),
  ('29309049', null),
  ('29339911', null),
  ('38248700', null),
  ('29038100', null),
  ('29153990', null),
  ('29222125', null),
  ('29309092', null),
  ('29339912', null),
  ('38248800', null),
  ('29038915', null),
  ('29154010', null),
  ('29222140', null),
  ('29314100', null),
  ('29339914', null),
  ('38248900', null),
  ('29038920', null),
  ('29154020', null),
  ('29222150', null),
  ('29314200', null),
  ('29339916', null),
  ('38249100', null),
  ('29038970', null),
  ('29154030', null),
  ('29222903', null),
  ('29314300', null),
  ('29339917', null),
  ('38249200', null),
  ('29039200', null),
  ('29154050', null),
  ('29222906', null),
  ('29314400', null),
  ('29339922', null),
  ('38249925', null),
  ('29039300', null),
  ('29155020', null),
  ('29222908', null),
  ('29314500', null),
  ('29339924', null),
  ('38249929', null),
  ('29039400', null),
  ('29159010', null),
  ('29222910', null),
  ('29314600', null),
  ('29339926', null),
  ('38249949', null),
  ('29039920', null),
  ('29159014', null),
  ('29222913', null),
  ('29314700', null),
  ('29339942', null),
  ('38249950', null),
  ('29039980', null),
  ('29159018', null),
  ('29222915', null),
  ('29314800', null),
  ('29339946', null),
  ('38249955', null),
  ('29041032', null),
  ('29159020', null),
  ('29222920', null),
  ('29314900', null),
  ('29339951', null),
  ('38249993', null),
  ('29041050', null),
  ('29159050', null),
  ('29222926', null),
  ('29315100', null),
  ('29339953', null),
  ('38260030', null),
  ('29042010', null),
  ('29161600', null),
  ('29222927', null),
  ('29315200', null),
  ('29339955', null),
  ('38271300', null),
  ('29042015', null),
  ('29161930', null),
  ('29222929', null),
  ('29315300', null),
  ('29339958', null),
  ('38271400', null),
  ('29042020', null),
  ('29161950', null),
  ('29222961', null),
  ('29315400', null),
  ('29339961', null),
  ('38274000', null),
  ('29042030', null),
  ('29162050', null),
  ('29222981', null),
  ('29315900', null),
  ('29339965', null),
  ('39019090', null),
  ('29042035', null),
  ('29163130', null),
  ('29223100', null),
  ('29319022', null),
  ('29339970', null),
  ('39029000', null),
  ('29042040', null),
  ('29163150', null),
  ('29223905', null),
  ('29319030', null),
  ('29339975', null),
  ('39046100', null),
  ('29042045', null),
  ('29163915', null),
  ('29223910', null),
  ('29319060', null),
  ('29339979', null),
  ('39059110', null),
  ('29042050', null),
  ('29163917', null),
  ('29223914', null),
  ('29319090', null),
  ('29339982', null),
  ('39059150', null),
  ('29049904', null),
  ('29163946', null),
  ('29223917', null),
  ('29321100', null),
  ('29339985', null),
  ('39059980', null),
  ('29049908', null),
  ('29163979', null),
  ('29223925', null),
  ('29321400', null),
  ('29339989', null),
  ('39069050', null),
  ('29049915', null),
  ('29171300', null),
  ('29223945', null),
  ('29321910', null),
  ('29339990', null),
  ('39071000', null),
  ('29049920', null),
  ('29171910', null),
  ('29223950', null),
  ('29321951', null),
  ('29339997', null),
  ('39072100', null),
  ('29049930', null),
  ('29171915', null),
  ('29224100', null),
  ('29322005', null),
  ('29341010', null),
  ('39072900', null),
  ('29049935', null),
  ('29171917', null),
  ('29224210', null),
  ('29322020', null),
  ('29341020', null),
  ('39073000', null),
  ('29049940', null),
  ('29171920', null),
  ('29224250', null),
  ('29322025', null),
  ('29341070', null),
  ('39076100', null),
  ('29049947', null),
  ('29171923', null),
  ('29224310', null),
  ('29322030', null),
  ('29341090', null),
  ('39076900', null),
  ('29049950', null),
  ('29171927', null),
  ('29224350', null),
  ('29322045', null),
  ('29342040', null),
  ('39077000', null),
  ('29051120', null),
  ('29171930', null),
  ('29224400', null),
  ('29322050', null),
  ('29342080', null),
  ('39079950', null),
  ('29051200', null),
  ('29171935', null),
  ('29224905', null),
  ('29329500', null),
  ('29343018', null),
  ('39081000', null),
  ('29051300', null),
  ('29171940', null),
  ('29224910', null),
  ('29329904', null),
  ('29343023', null),
  ('39089020', null),
  ('29051910', null),
  ('29171970', null),
  ('29224926', null),
  ('29329908', null),
  ('29343027', null),
  ('39091000', null),
  ('29051990', null),
  ('29172000', null),
  ('29224930', null),
  ('29329921', null),
  ('29343043', null),
  ('39094000', null),
  ('29052210', null),
  ('29173401', null),
  ('29224937', null),
  ('29329932', null),
  ('29343050', null),
  ('39100000', null),
  ('29052220', null),
  ('29173700', null),
  ('29224943', null),
  ('29329935', null),
  ('29349100', null),
  ('39112000', null),
  ('29052250', null),
  ('29173930', null),
  ('29224949', null),
  ('29329939', null),
  ('29349200', null),
  ('39119025', null),
  ('29052990', null),
  ('29181151', null),
  ('29224960', null),
  ('29329955', null),
  ('29349901', null),
  ('39119045', null),
  ('29053100', null),
  ('29181200', null),
  ('29224980', null),
  ('29329961', null),
  ('29349903', null),
  ('39119091', null),
  ('29053200', null),
  ('29181350', null),
  ('29225007', null),
  ('29329970', null),
  ('29349905', null),
  ('39122000', null),
  ('29053990', null),
  ('29181400', null),
  ('29225010', null),
  ('29329990', null),
  ('29349906', null),
  ('39123100', null),
  ('29054920', null),
  ('29181650', null),
  ('29225011', null),
  ('29331100', null),
  ('29349907', null),
  ('39123900', null),
  ('29054950', null),
  ('29181800', null),
  ('29225013', null),
  ('29331908', null),
  ('29349908', null),
  ('39129000', null),
  ('29055100', null),
  ('29181915', null),
  ('29225014', null),
  ('29331935', null),
  ('29349909', null),
  ('39139020', null),
  ('29055910', null),
  ('29181920', null),
  ('29225017', null),
  ('29331937', null),
  ('29349911', null),
  ('39139050', null),
  ('29055990', null),
  ('29181931', null),
  ('29225019', null),
  ('29331943', null),
  ('29349912', null),
  ('39140020', null),
  ('29061100', null),
  ('29181960', null),
  ('29225025', null),
  ('29331945', null),
  ('29349915', null),
  ('39140060', null),
  ('29061950', null),
  ('29181990', null),
  ('29225035', null),
  ('29331990', null),
  ('29349916', null),
  ('29062960', null),
  ('29182110', null),
  ('29225040', null),
  ('29332100', null),
  ('29349918', null),
  ('29071100', null),
  ('29182210', null),
  ('29225050', null),
  ('29332905', null),
  ('29349920', null)
) as v(prefix, description);
