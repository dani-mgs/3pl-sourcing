-- Policy data for the Tariff Calculator that isn't in the HTS itself:
--   customs_fees            MPF and HMF rates/limits, by effective date
--   hts_column2_countries   origins charged the HTS column 2 rate
--   duty_programs           additional-duty programs, and the warning shown
--                           while a program's duties aren't loaded
-- Signed-in users read; only admins write (enforced here by RLS, and in the
-- app by the admin check in each server action). Rates are never hardcoded in
-- the app: they live in these rows, each with its source.

create extension if not exists btree_gist with schema extensions;

-- Stamps who/when on admin-maintained rows. created_by/updated_by are always
-- the signed-in user (NULL for rows seeded by a migration), whatever the
-- request sent.
create function set_admin_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ============================================================
-- customs_fees
-- ============================================================
create table customs_fees (
  id uuid primary key default gen_random_uuid(),
  --   mpf_formal    ad valorem MPF with a per-entry minimum and maximum
  --   mpf_informal  flat MPF for an informal entry (automated, not prepared
  --                 by CBP), up to applies_up_to_value_usd
  --   hmf           harbor maintenance fee, ocean shipments only
  fee_code text not null
    constraint customs_fees_fee_code_check
    check (fee_code in ('mpf_formal', 'mpf_informal', 'hmf')),
  label text not null,
  -- Percent of value: 0.3464 means 0.3464%.
  rate_pct numeric(9,6)
    constraint customs_fees_rate_pct_check check (rate_pct >= 0),
  min_usd numeric(12,2),
  max_usd numeric(12,2),
  flat_usd numeric(12,2),
  applies_up_to_value_usd numeric(14,2),
  effective_from date not null,
  -- Last day the row applies (inclusive); NULL while it's still in force.
  effective_to date,
  source_label text not null,
  source_url text not null
    constraint customs_fees_source_url_check check (source_url ~ '^https://'),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint customs_fees_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint customs_fees_shape_check check (
    (fee_code = 'mpf_formal' and rate_pct is not null and min_usd is not null
      and max_usd is not null and max_usd >= min_usd and flat_usd is null)
    or (fee_code = 'mpf_informal' and flat_usd is not null
      and applies_up_to_value_usd is not null and rate_pct is null)
    or (fee_code = 'hmf' and rate_pct is not null and flat_usd is null)
  ),
  -- One row per fee in force on any given day.
  constraint customs_fees_no_overlap
    exclude using gist (fee_code with =, daterange(effective_from, effective_to, '[]') with &&)
);

create trigger customs_fees_audit
  before insert or update on customs_fees
  for each row execute function set_admin_audit_fields();

-- FY2027 values (Federal Register 2026-15530, in force from 2026-10-01).
insert into customs_fees
  (fee_code, label, rate_pct, min_usd, max_usd, flat_usd, applies_up_to_value_usd,
   effective_from, source_label, source_url, notes)
values
  ('mpf_formal', 'Merchandise Processing Fee (formal entry)', 0.3464, 34.58, 670.86, null, null,
   '2026-10-01',
   'Federal Register 2026-15530: Customs User Fees To Be Adjusted for Inflation in Fiscal Year 2027',
   'https://www.federalregister.gov/documents/2026/07/31/2026-15530/customs-user-fees-to-be-adjusted-for-inflation-in-fiscal-year-2027',
   'FY2027 limits. The 0.3464% rate is unchanged; only the minimum and maximum rose.'),
  ('mpf_informal', 'Merchandise Processing Fee (informal entry, automated)', null, null, null, 2.77, 2500.00,
   '2026-10-01',
   'Federal Register 2026-15530: Customs User Fees To Be Adjusted for Inflation in Fiscal Year 2027',
   'https://www.federalregister.gov/documents/2026/07/31/2026-15530/customs-user-fees-to-be-adjusted-for-inflation-in-fiscal-year-2027',
   'Informal entry, automated and not prepared by CBP personnel. The $2,500 informal-entry limit is in 19 CFR 143.21.'),
  ('hmf', 'Harbor Maintenance Fee', 0.125, null, null, null, null,
   '1991-01-01',
   '19 CFR 24.24 (Harbor maintenance fee)',
   'https://www.ecfr.gov/current/title-19/section-24.24',
   'Ocean shipments only. 0.125% since 1 January 1991 (Omnibus Budget Reconciliation Act of 1990). No minimum or maximum.');

-- ============================================================
-- hts_column2_countries
-- ============================================================
create table hts_column2_countries (
  id uuid primary key default gen_random_uuid(),
  -- ISO 3166-1 alpha-2.
  country_code text not null
    constraint hts_column2_countries_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  -- NULL: on the list since before this table's records begin.
  effective_from date,
  effective_to date,
  source_label text not null,
  source_url text not null
    constraint hts_column2_countries_source_url_check check (source_url ~ '^https://'),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint hts_column2_countries_dates_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint hts_column2_countries_no_overlap
    exclude using gist (country_code with =, daterange(effective_from, effective_to, '[]') with &&)
);

create trigger hts_column2_countries_audit
  before insert or update on hts_column2_countries
  for each row execute function set_admin_audit_fields();

insert into hts_column2_countries (country_code, effective_from, source_label, source_url, notes)
values
  ('CU', null, 'HTSUS General Note 3(b)', 'https://hts.usitc.gov/', null),
  ('KP', null, 'HTSUS General Note 3(b)', 'https://hts.usitc.gov/', null),
  ('RU', '2022-04-09', 'Suspending Normal Trade Relations with Russia and Belarus Act (FR 2022-14145)',
   'https://www.govinfo.gov/content/pkg/FR-2022-06-30/pdf/2022-14145.pdf', null),
  ('BY', '2022-04-09', 'Suspending Normal Trade Relations with Russia and Belarus Act (FR 2022-14145)',
   'https://www.govinfo.gov/content/pkg/FR-2022-06-30/pdf/2022-14145.pdf', null);

-- ============================================================
-- duty_programs
-- ============================================================
create table duty_programs (
  key text primary key
    constraint duty_programs_key_check check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  --   not_loaded  its duties aren't in the calculator yet: show the warning
  --               whenever the trigger matches, never a silent zero
  --   inactive    no longer applies; no warning
  status text not null default 'not_loaded'
    constraint duty_programs_status_check check (status in ('not_loaded', 'inactive')),
  -- Shown when the trigger matches and the program isn't loaded.
  warning_text text not null,
  -- The warning shows when the origin is in trigger_origins (ISO alpha-2;
  -- NULL = any origin) AND the HTS code starts with one of
  -- trigger_hts_prefixes (NULL = any code). Deliberately broad: a warning
  -- that may not apply beats a duty silently left out.
  trigger_origins text[],
  trigger_hts_prefixes text[],
  -- Only where the program adds a single known flat percentage for an origin
  -- (ISO alpha-2 → percent of customs value), e.g. {"VN": 12.5}; shown as a
  -- rough "could add up to X%" next to the excluded program. Origins with a
  -- minimum-total rate, a product-dependent rate, or an unverified rate are
  -- left out and only named.
  indicative_rates jsonb,
  indicative_rates_source text,
  source_label text not null,
  source_url text not null
    constraint duty_programs_source_url_check check (source_url ~ '^https://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint duty_programs_trigger_check
    check (trigger_origins is not null or trigger_hts_prefixes is not null),
  constraint duty_programs_origins_check
    check (trigger_origins is null or array_to_string(trigger_origins, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
  constraint duty_programs_prefixes_check
    check (trigger_hts_prefixes is null or array_to_string(trigger_hts_prefixes, ',') ~ '^[0-9]{2,10}(,[0-9]{2,10})*$'),
  constraint duty_programs_indicative_rates_check check (
    indicative_rates is null or (
      jsonb_typeof(indicative_rates) = 'object'
      and not jsonb_path_exists(indicative_rates, '$.keyvalue() ? (!(@.key like_regex "^[A-Z]{2}$"))')
      and not jsonb_path_exists(indicative_rates, '$.* ? (@.type() != "number" || @ <= 0 || @ > 1000)')
    )
  ),
  constraint duty_programs_indicative_source_check
    check ((indicative_rates is null) = (indicative_rates_source is null))
);

create trigger duty_programs_audit
  before insert or update on duty_programs
  for each row execute function set_admin_audit_fields();

-- Every program starts not loaded (PR 2a/2b load the duties). Origins for the
-- forced-labour action are the 60 economies of HTS headings 9903.05.20–.84
-- (2026 HTS Revision 20), EU member states expanded. Chapter triggers for the
-- Section 232 programs are intentionally broad.
insert into duty_programs
  (key, name, warning_text, trigger_origins, trigger_hts_prefixes, source_label, source_url, sort_order)
values
  ('section_301_forced_labor', 'Section 301 (forced labour)',
   'Section 301 forced-labour duties may apply to goods of this origin unless an exemption applies. Not included in this estimate.',
   array['DZ','AO','AR','AU','BS','BH','BD','BR','KH','CA','CL','CN','CO','CR','DO','EC','EG','SV',
         'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
         'GT','GY','HN','HK','IN','ID','IQ','IL','JP','JO','KZ','KW','LY','MY','MX','MA','NZ','NI','NG','NO','OM','PK','PE','PH',
         'QA','RU','SA','SG','ZA','KR','LK','CH','TW','TH','TT','TR','AE','GB','UY','VE','VN'],
   null,
   'USTR notice, Federal Register 2026-15181',
   'https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies',
   10),
  ('section_301_china', 'Section 301 (China)',
   'China origin: Section 301 duties may apply to this product. Not included in this estimate.',
   array['CN'], null,
   'CBP Section 301 trade remedies FAQ',
   'https://www.cbp.gov/trade/programs-administration/entry-summary/section-301-trade-remedies/faqs',
   20),
  ('section_301_brazil', 'Section 301 (Brazil)',
   'Brazil origin: Section 301 duties may apply unless an exemption applies. Not included in this estimate.',
   array['BR'], null,
   'USTR notice, Federal Register 2026-14542',
   'https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment',
   30),
  ('section_301_nicaragua', 'Section 301 (Nicaragua)',
   'Nicaragua origin: Section 301 duties may apply. Not included in this estimate.',
   array['NI'], null,
   'USTR notice, Federal Register 2025-23892',
   'https://www.federalregister.gov/documents/2025/12/29/2025-23892/notice-of-implementation-of-action-nicaraguas-acts-policies-and-practices-related-to-labor-rights',
   40),
  ('section_232_metals', 'Section 232 (steel, aluminium, copper)',
   'Section 232 duties on steel, aluminium and copper articles and their derivatives may apply to this product. Not included in this estimate.',
   null, array['72','73','74','76'],
   'CBP Section 232 aluminum and steel FAQ',
   'https://www.cbp.gov/trade/programs-administration/entry-summary/232-tariffs-aluminum-and-steel/faqs',
   50),
  ('section_232_vehicles', 'Section 232 (vehicles and parts)',
   'Section 232 duties on vehicles and vehicle parts may apply to this product. Not included in this estimate.',
   null, array['87'],
   'CBP Section 232 autos FAQ',
   'https://www.cbp.gov/trade/programs-administration/entry-summary/section-232-additional-faqs-autos/faqs',
   60),
  ('section_232_timber', 'Section 232 (timber, lumber and derivatives)',
   'Section 232 duties on timber, lumber and derivative products (including some furniture and cabinets) may apply. Not included in this estimate.',
   null, array['44','9401','9403'],
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   70),
  ('section_232_semiconductors', 'Section 232 (semiconductors)',
   'Section 232 duties on semiconductors and derivative products may apply. Not included in this estimate.',
   null, array['8541','8542'],
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   80),
  ('section_232_pharmaceuticals', 'Section 232 (pharmaceuticals)',
   'Section 232 duties on pharmaceuticals and pharmaceutical ingredients may apply. Not included in this estimate.',
   null, array['29','30'],
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   90),
  ('section_232_drones', 'Section 232 (unmanned aircraft systems)',
   'Section 232 duties on drones and drone parts may apply. Not included in this estimate.',
   null, array['8806'],
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   100),
  ('section_338_canada', 'Section 338 (Canada)',
   'Canada origin: Section 338 duties apply to some goods (including goods that qualify for USMCA), and some goods are banned. Not included in this estimate.',
   array['CA'], null,
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   110),
  ('sanctioned_origins', 'Sanctions and further duties (column 2 origins)',
   'Goods of this origin face sanctions-related restrictions or import bans, and may be subject to further Chapter 99 duties. Check with your customs broker before relying on this estimate.',
   array['RU','BY','CU','KP'], null,
   'CBP trade remedies',
   'https://www.cbp.gov/trade/programs-administration/trade-remedies',
   120);

-- Flat additional rates per origin, read from the HTS Chapter 99 headings
-- (2026 HTS Revision 20, checked 2026-10-02 via the USITC REST API). The
-- forced-labour minimum-total origins (EU members, Japan, South Korea,
-- Switzerland, Taiwan; headings 9903.05.38/.39, .48/.49, .70/.71, .73/.74,
-- .75/.76) have no single flat rate and are left out. Other programs' rates
-- vary by product or aren't verified yet, so they're only named.
update duty_programs
  set indicative_rates = '{"AE": 12.5, "AO": 12.5, "AR": 10, "AU": 12.5, "BD": 10, "BH": 12.5, "BR": 12.5, "BS": 12.5, "CA": 10, "CL": 12.5, "CN": 12.5, "CO": 12.5, "CR": 12.5, "DO": 12.5, "DZ": 12.5, "EC": 10, "EG": 12.5, "GB": 10, "GT": 10, "GY": 12.5, "HK": 12.5, "HN": 10, "ID": 10, "IL": 12.5, "IN": 10, "IQ": 12.5, "JO": 10, "KH": 10, "KW": 12.5, "KZ": 12.5, "LK": 10, "LY": 12.5, "MA": 12.5, "MX": 10, "MY": 10, "NG": 12.5, "NI": 12.5, "NO": 12.5, "NZ": 12.5, "OM": 12.5, "PE": 12.5, "PH": 12.5, "PK": 10, "QA": 12.5, "RU": 12.5, "SA": 12.5, "SG": 12.5, "SV": 10, "TH": 12.5, "TR": 12.5, "TT": 10, "UY": 12.5, "VE": 12.5, "VN": 12.5, "ZA": 12.5}',
      indicative_rates_source = 'HTS headings 9903.05.20–9903.05.84 (2026 Revision 20)'
  where key = 'section_301_forced_labor';

update duty_programs
  set indicative_rates = '{"BR": 25}',
      indicative_rates_source = 'HTS heading 9903.05.01 (2026 Revision 20)'
  where key = 'section_301_brazil';

-- ============================================================
-- RLS: signed-in users read; admins write
-- ============================================================
alter table customs_fees enable row level security;
alter table hts_column2_countries enable row level security;
alter table duty_programs enable row level security;

create policy "Authenticated users can read customs fees"
  on customs_fees for select to authenticated using (true);
create policy "Admins can insert customs fees"
  on customs_fees for insert to authenticated with check (is_admin());
create policy "Admins can update customs fees"
  on customs_fees for update to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can delete customs fees"
  on customs_fees for delete to authenticated using (is_admin());

create policy "Authenticated users can read column 2 countries"
  on hts_column2_countries for select to authenticated using (true);
create policy "Admins can insert column 2 countries"
  on hts_column2_countries for insert to authenticated with check (is_admin());
create policy "Admins can update column 2 countries"
  on hts_column2_countries for update to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can delete column 2 countries"
  on hts_column2_countries for delete to authenticated using (is_admin());

create policy "Authenticated users can read duty programs"
  on duty_programs for select to authenticated using (true);
create policy "Admins can insert duty programs"
  on duty_programs for insert to authenticated with check (is_admin());
create policy "Admins can update duty programs"
  on duty_programs for update to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can delete duty programs"
  on duty_programs for delete to authenticated using (is_admin());

revoke all on table customs_fees from anon, authenticated;
revoke all on table hts_column2_countries from anon, authenticated;
revoke all on table duty_programs from anon, authenticated;
grant select, insert, update, delete on table customs_fees to authenticated;
grant select, insert, update, delete on table hts_column2_countries to authenticated;
grant select, insert, update, delete on table duty_programs to authenticated;
