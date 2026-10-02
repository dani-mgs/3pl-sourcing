-- Tariff Calculator reference data. HTS tables are written only by the cron
-- job (service role): signed-in users read them, nobody else writes, and only
-- the service role can activate a release, which refuses partial imports.
-- Fees, column 2 countries and duty programs are readable by any signed-in
-- user and writable only by admins, with who/when stamped on each change.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e001', 'pgTAPRev1', 'current', 100, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, general_rate) values
  ('00000000-0000-4000-8000-00000000e001', '6402993110', '64', 2, 'House slippers', '6%');

-- ---- Signed-in user: reads everything, writes nothing -----------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select isnt_empty('select * from hts_releases', 'a signed-in user can read hts_releases');
select isnt_empty('select * from hts_lines', 'a signed-in user can read hts_lines');
select is((select count(*)::int from customs_fees), 3, 'a signed-in user can read the seeded fees (MPF formal, MPF informal, HMF)');
select is((select count(*)::int from hts_column2_countries), 4, 'a signed-in user can read the column 2 countries (CU, KP, RU, BY)');
select is((select count(*)::int from duty_programs where status = 'not_loaded'), 12, 'every seeded duty program starts not loaded');
select is(
  (select (indicative_rates ->> 'VN')::numeric from duty_programs where key = 'section_301_forced_labor'),
  12.5, 'forced-labour Section 301 has a flat 12.5% indicative rate for Vietnam'
);
select is(
  (select indicative_rates ->> 'DE' from duty_programs where key = 'section_301_forced_labor'),
  null, 'a minimum-total origin (Germany) has no flat indicative rate'
);

select throws_ok($$ insert into hts_releases (name) values ('hacked') $$, '42501', null, 'a signed-in user cannot insert an HTS release');
select throws_ok($$ update hts_lines set general_rate = '0%' $$, '42501', null, 'a signed-in user cannot update HTS lines');
select throws_ok($$ delete from hts_lines $$, '42501', null, 'a signed-in user cannot delete HTS lines');
select throws_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-00000000e001', 1) $$,
  '42501', null, 'a signed-in user cannot activate an HTS release'
);

select throws_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, effective_from, source_label, source_url)
     values ('hmf', 'x', 0.5, '2030-01-01', 'x', 'https://example.gov/') $$,
  '42501', null, 'a non-admin cannot insert a fee'
);
select is_empty($$ update customs_fees set rate_pct = 9 where fee_code = 'hmf' returning id $$, 'a non-admin cannot update a fee');
select is_empty($$ delete from customs_fees returning id $$, 'a non-admin cannot delete fees');
select is_empty($$ update duty_programs set status = 'inactive' returning key $$, 'a non-admin cannot update duty programs');
select is_empty($$ delete from hts_column2_countries returning id $$, 'a non-admin cannot delete column 2 countries');

reset role;
select is((select rate_pct from customs_fees where fee_code = 'hmf'), 0.125::numeric, 'the HMF rate is unchanged');
select is((select count(*)::int from duty_programs where status = 'not_loaded'), 12, 'the duty programs are unchanged');

-- ---- Admin: maintains fees and programs; audit fields are stamped ------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');

select throws_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, min_usd, max_usd, effective_from, source_label, source_url)
     values ('mpf_formal', 'MPF FY2028', 0.3464, 35.5, 690, '2027-10-01', 'FR', 'https://example.gov/') $$,
  '23P01', null, 'a fee row may not overlap the one in force (exclusion constraint)'
);
select isnt_empty(
  $$ update customs_fees set effective_to = '2027-09-30' where fee_code = 'mpf_formal' returning id $$,
  'an admin can end a fee row'
);
select lives_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, min_usd, max_usd, effective_from, source_label, source_url, created_by)
     values ('mpf_formal', 'MPF FY2028', 0.3464, 35.5, 690, '2027-10-01', 'FR', 'https://example.gov/',
             '00000000-0000-4000-8000-0000000000a1') $$,
  'an admin can add the next fee row'
);
select is(
  (select created_by from customs_fees where effective_from = '2027-10-01'),
  '00000000-0000-4000-8000-0000000000ad'::uuid,
  'created_by is the signed-in admin, whatever the request sent'
);
select is(
  (select updated_by from customs_fees where fee_code = 'mpf_formal' and effective_to = '2027-09-30'),
  '00000000-0000-4000-8000-0000000000ad'::uuid,
  'updated_by is stamped on change'
);
select is(
  (select created_by from customs_fees where fee_code = 'mpf_formal' and effective_to = '2027-09-30'),
  null::uuid,
  'an update keeps the original created_by (NULL for seeded rows)'
);
select throws_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, effective_from, source_label, source_url)
     values ('mpf_formal', 'bad', 0.3464, '2031-01-01', 'FR', 'https://example.gov/') $$,
  '23514', null, 'a formal MPF row needs its minimum and maximum'
);
select isnt_empty(
  $$ update duty_programs set warning_text = 'Updated wording.' where key = 'section_301_china' returning key $$,
  'an admin can update a duty program'
);
select throws_ok(
  $$ insert into duty_programs (key, name, warning_text, source_label, source_url)
     values ('no_trigger', 'x', 'x', 'x', 'https://example.gov/') $$,
  '23514', null, 'a duty program needs an origin or HTS trigger'
);
select throws_ok(
  $$ insert into duty_programs (key, name, warning_text, trigger_origins, source_label, source_url)
     values ('bad_origin', 'x', 'x', array['China'], 'x', 'https://example.gov/') $$,
  '23514', null, 'trigger origins must be ISO alpha-2 codes'
);
select throws_ok(
  $$ update duty_programs set indicative_rates = '{"Vietnam": 12.5}', indicative_rates_source = 'x' where key = 'section_301_china' $$,
  '23514', null, 'indicative rate keys must be ISO alpha-2 codes'
);
select throws_ok(
  $$ update duty_programs set indicative_rates = '{"CN": "25%"}', indicative_rates_source = 'x' where key = 'section_301_china' $$,
  '23514', null, 'indicative rates must be positive numbers'
);
select throws_ok($$ delete from hts_lines $$, '42501', null, 'an admin cannot write HTS lines either (cron only)');

reset role;

-- ---- Activation (service role only) -----------------------------------------
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e002', 'pgTAPRev2', 'importing', 100, 2);
insert into hts_lines (release_id, hts_code, chapter, indent, description, general_rate) values
  ('00000000-0000-4000-8000-00000000e002', '6402993110', '64', 2, 'House slippers', '6%'),
  ('00000000-0000-4000-8000-00000000e002', '6402993115', '64', 2, 'Tennis shoes', '6%');

set local role service_role;
select throws_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-00000000e002', 3) $$,
  'P0001', null, 'activation refuses when the stored row count does not match'
);
select lives_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-00000000e002', 2) $$,
  'the service role can activate a complete import'
);
reset role;

select is((select status from hts_releases where name = 'pgTAPRev2'), 'current', 'the new release is current');
select is((select status from hts_releases where name = 'pgTAPRev1'), 'superseded', 'the previous release is superseded');
select is(
  (select count(*)::int from hts_lines where release_id = '00000000-0000-4000-8000-00000000e001'),
  0, 'the superseded release''s lines are deleted'
);

insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e003', 'pgTAPRev3', 'importing', 50, 0);
select throws_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-00000000e003', 0) $$,
  'P0001', null, 'activation refuses an incomplete import'
);
select is((select status from hts_releases where name = 'pgTAPRev2'), 'current', 'a refused activation leaves the current release alone');
select throws_ok(
  $$ insert into hts_releases (name, status) values ('pgTAPRev4', 'importing') $$,
  '23505', null, 'only one import can be in progress'
);
select throws_ok(
  $$ update hts_releases set status = 'current' where name = 'pgTAPRev1' $$,
  '23505', null, 'only one release can be current'
);

select * from finish();
rollback;
