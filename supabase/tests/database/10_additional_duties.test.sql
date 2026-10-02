-- Additional duties: everyone signed in reads; only tariff editors (and
-- admins) write duties, scope and reviews. Rates are never edited in place,
-- every change is recorded in history, and any change after a review puts
-- the program back to pending review. The seed is pending review. Chapter 99
-- changes are recorded when an HTS release is activated. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.act_as(uid uuid, meta jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', meta)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.status(p text) returns text language sql as $$
  select review_status from duty_program_review_status where program_key = p
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

-- ---- Seed ------------------------------------------------------------------
select is((select count(*)::int from additional_duties where program_key = 'section_301_forced_labor'), 74, 'forced-labour seed: 55 flat, 5 minimum-total, 14 exemption rows');
select is((select count(*)::int from additional_duties where program_key = 'section_301_brazil'), 5, 'Brazil seed: the 25% row and 4 exemption rows');
select is(pg_temp.status('section_301_forced_labor'), 'pending_review', 'the forced-labour seed is pending review');
select is(pg_temp.status('section_301_brazil'), 'pending_review', 'the Brazil seed is pending review');
select is(pg_temp.status('section_301_china'), 'not_loaded', 'a program with no rows is not loaded');
select is((select rate_pct from additional_duties where chapter99_heading = '9903.05.84'), 12.5::numeric, 'Vietnam is +12.5% (9903.05.84)');
select is(
  (select row(rate_type, rate_pct, chapter99_heading_at_minimum)::text from additional_duties where chapter99_heading = '9903.05.39'),
  '(minimum_total,10.0000,9903.05.38)', 'EU goods: minimum total 10% (9903.05.39 / 9903.05.38)'
);
select is(
  (select count(*)::int from additional_duty_scope s join additional_duties d on d.id = s.duty_id where d.chapter99_heading = '9903.05.03'),
  864, 'Brazil 9903.05.03 lists the 864 subheadings of note 50(a)(ii)'
);
select ok(
  (select bool_and(source_url like 'https://www.federalregister.gov/%' and source_checked_on = '2026-10-02') from additional_duties),
  'every seeded row cites its Federal Register notice and the date it was checked'
);
select is(
  (select excludes_programs from additional_duties where chapter99_heading = '9903.05.31'),
  array['section_232_metals','section_232_vehicles','section_232_timber','section_232_semiconductors','section_232_pharmaceuticals'],
  'China forced-labour duty is excluded when a Section 232 duty applies (note 52(f), not drones)'
);

-- ---- Plain user: reads only ------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select isnt_empty('select * from additional_duties', 'a signed-in user can read additional duties');
select isnt_empty('select * from duty_program_review_status', 'a signed-in user can read review status');
select throws_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       effective_from, source_label, source_url, source_checked_on)
     values ('section_301_china', 'section_301', '9903.88.03', 'China', 'add', 25, array['CN'], '2026-01-01', 'x', 'https://example.gov/', '2026-10-02') $$,
  '42501', null, 'a plain user cannot add a duty'
);
select is_empty($$ update additional_duties set notes = 'x' returning id $$, 'a plain user cannot change a duty');
select is_empty($$ delete from additional_duty_scope returning id $$, 'a plain user cannot delete scope');
select throws_ok(
  $$ insert into duty_program_reviews (program_key) values ('section_301_brazil') $$,
  '42501', null, 'a plain user cannot mark a program reviewed'
);
select throws_ok($$ insert into tariff_data_history (table_name, row_id, operation) values ('x', gen_random_uuid(), 'INSERT') $$,
  '42501', null, 'nobody writes history directly');

-- ---- Tariff editor ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select lives_ok(
  $$ insert into duty_program_reviews (program_key, note) values ('section_301_brazil', 'Checked against FR 2026-14542') $$,
  'a tariff editor can mark a program reviewed'
);
select is(pg_temp.status('section_301_brazil'), 'reviewed', 'the program is reviewed');
select throws_ok(
  $$ insert into duty_program_reviews (program_key, reviewed_by) values ('section_301_brazil', '00000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'a review can only be recorded in your own name'
);
select throws_like(
  $$ update additional_duties set rate_pct = 30 where chapter99_heading = '9903.05.01' $$,
  '%end-date this row%', 'a rate cannot be edited in place'
);
select isnt_empty(
  $$ update additional_duties set legal_status = 'in_force_under_litigation', notes = 'CIT case pending'
     where chapter99_heading = '9903.05.01' returning id $$,
  'a tariff editor can update legal status and notes'
);
select is(pg_temp.status('section_301_brazil'), 'pending_review', 'any change puts the program back to pending review');
select is(
  (select changed_by from tariff_data_history where table_name = 'additional_duties' and operation = 'UPDATE' order by changed_at desc limit 1),
  '00000000-0000-4000-8000-0000000000e1'::uuid, 'history records who made the change'
);
select isnt_empty(
  $$ update additional_duties set effective_to = '2026-12-31' where chapter99_heading = '9903.05.01' returning id $$,
  'a tariff editor can end-date a row'
);
select lives_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       excludes_programs, exclusion_heading, effective_from, source_label, source_url, source_checked_on)
     values ('section_301_brazil', 'section_301', '9903.05.01', 'Brazil', 'add', 30, array['BR'],
       array['section_232_metals'], '9903.05.07', '2027-01-01', 'x', 'https://example.gov/', '2026-10-02') $$,
  'and add the replacement row from the next day'
);
select throws_ok(
  $$ insert into additional_duties (program_key, authority, chapter99_heading, label, rate_type, rate_pct, origin_countries,
       excludes_programs, exclusion_heading, effective_from, source_label, source_url, source_checked_on)
     values ('section_301_brazil', 'section_301', '9903.05.01', 'Brazil', 'add', 35, array['BR'],
       array['section_232_metals'], '9903.05.07', '2027-06-01', 'x', 'https://example.gov/', '2026-10-02') $$,
  '23P01', null, 'two rows for one heading cannot overlap'
);
select is_empty(
  $$ update duty_programs set status = 'inactive' where key = 'section_301_brazil' returning key $$,
  'a tariff editor still cannot change duty programs'
);

reset role;

-- ---- Chapter 99 change detection on activation --------------------------------
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000f001', 'pgTAPOld', 'current', 100, 2),
  ('00000000-0000-4000-8000-00000000f002', 'pgTAPNew', 'importing', 100, 2);
insert into hts_lines (release_id, hts_code, chapter, indent, description, general_rate) values
  ('00000000-0000-4000-8000-00000000f001', '9903053100', '99', 0, 'China', 'The duty provided in the applicable subheading + 12.5%'),
  ('00000000-0000-4000-8000-00000000f001', '9903059000', '99', 0, 'Section 232 goods', 'The duty provided in the applicable subheading'),
  ('00000000-0000-4000-8000-00000000f002', '9903053100', '99', 0, 'China', 'The duty provided in the applicable subheading + 15%'),
  ('00000000-0000-4000-8000-00000000f002', '9903059900', '99', 0, 'New exemption', 'The duty provided in the applicable subheading');
set local role service_role;
select lives_ok($$ select activate_hts_release('00000000-0000-4000-8000-00000000f002', 2) $$, 'activation succeeds');
reset role;
select results_eq(
  $$ select hts_code, change, new_rate from hts_chapter99_changes where release_name = 'pgTAPNew' order by hts_code $$,
  $$ values ('9903053100'::text, 'changed'::text, 'The duty provided in the applicable subheading + 15%'::text),
            ('9903059000', 'removed', null),
            ('9903059900', 'added', 'The duty provided in the applicable subheading') $$,
  'chapter 99 headings changed, removed and added are recorded'
);

-- ---- Estimates with additional duties ------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select lives_ok(
  $$ insert into duty_estimates (as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, additional_duties_usd,
       fees_usd, total_usd, lines)
     values ('2026-10-02', '6402993110', 'x', 'r', 'general', '6%', 'IN', 'Sea', 10000, 10000, 600, 1000, 47.14, 1647.14, '[]') $$,
  'an estimate total includes additional duties'
);
select throws_ok(
  $$ insert into duty_estimates (as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, additional_duties_usd,
       fees_usd, total_usd, lines)
     values ('2026-10-02', '6402993110', 'x', 'r', 'general', '6%', 'IN', 'Sea', 10000, 10000, 600, 1000, 47.14, 647.14, '[]') $$,
  '23514', null, 'a total that leaves out the additional duties is refused'
);
reset role;
select is(
  (select count(*)::int from additional_duties where program_key = 'section_301_forced_labor'),
  74, 'the forced-labour rows are unchanged'
);

select * from finish();
rollback;
