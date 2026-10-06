-- HTS code lookup (migration 20261005133647): activating a release fills
-- ancestor_text, so a 10-digit "Other" line is found by its parents' words;
-- search_hts_lines() searches the current release only, by keyword or code
-- subtree, in code order, with parent lines and programs that may apply;
-- input is validated; signed-in users can search and anon can't. Rolled back
-- at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}');

-- Start from no current release (a local database may hold a real import).
update hts_releases set status = 'superseded' where status = 'current';

-- ---- Activation fills ancestor_text -----------------------------------------
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e101', 'pgTAPLookup1', 'importing', 100, 5);
insert into hts_lines (release_id, hts_code, chapter, indent, description, ancestor_descriptions, units, general_rate) values
  ('00000000-0000-4000-8000-00000000e101', '6402', '64', 0,
   'Other footwear with outer soles and uppers of rubber or plastics:', '{}', '{}', null),
  ('00000000-0000-4000-8000-00000000e101', '640299', '64', 1, 'Other:',
   '{"Other footwear with outer soles and uppers of rubber or plastics:"}', '{}', null),
  ('00000000-0000-4000-8000-00000000e101', '6402993160', '64', 3, 'Other',
   '{"Other footwear with outer soles and uppers of rubber or plastics:","Other:","For women"}', '{prs.}', '6%'),
  ('00000000-0000-4000-8000-00000000e101', '6403', '64', 0,
   'Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather:', '{}', '{}', null),
  ('00000000-0000-4000-8000-00000000e101', '7318155000', '73', 2, 'Other screws and bolts',
   '{"Screws, bolts, nuts:","Threaded articles:"}', '{kg}', '8.6%');

select is(
  (select count(*)::int from hts_lines where release_id = '00000000-0000-4000-8000-00000000e101' and ancestor_text is not null),
  0, 'an importing release has no ancestor_text yet'
);
select lives_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-00000000e101', 5) $$,
  'the release activates'
);
select is(
  (select ancestor_text from hts_lines where release_id = '00000000-0000-4000-8000-00000000e101' and hts_code = '6402993160'),
  'Other footwear with outer soles and uppers of rubber or plastics: Other: For women',
  'activation fills ancestor_text from the ancestor descriptions'
);
select is(
  (select count(*)::int from hts_lines where release_id = '00000000-0000-4000-8000-00000000e101' and ancestor_text is null),
  0, 'every line of the activated release has ancestor_text'
);

-- A newer import in progress, with lines that would match: never searched.
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e102', 'pgTAPLookup2', 'importing', 3, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, ancestor_text) values
  ('00000000-0000-4000-8000-00000000e102', '6402990000', '64', 1, 'Rubber footwear (importing)', 'Footwear');

-- ---- Signed-in user ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select results_eq(
  $$ select hts_code from search_hts_lines(array['rubber', 'footwear']) $$,
  array['6402', '640299', '6402993160', '6403'],
  'keyword search returns every matching line of the current release, in code order'
);
select ok(
  exists (select 1 from search_hts_lines(array['women', 'plastic']) where hts_code = '6402993160'),
  'a 10-digit "Other" line is found by its parents'' words (stemmed: plastics → plastic)'
);
select results_eq(
  $$ select hts_code from search_hts_lines(array['footw']) $$,
  array['6402', '640299', '6402993160', '6403'],
  'keywords match as prefixes'
);
select is(
  (select count(*)::int from search_hts_lines(array['importing'])),
  0, 'lines of a release that isn''t current are never searched'
);
select is(
  (select count(*)::int from search_hts_lines(array['other'])),
  0, 'a stop word on its own matches nothing'
);

select results_eq(
  $$ select hts_code from search_hts_lines(null, '6402') $$,
  array['6402', '640299', '6402993160'],
  'code search returns the heading''s subtree'
);
select results_eq(
  $$ select hts_code from search_hts_lines(null, '640299') $$,
  array['640299', '6402993160'],
  'a 6-digit code returns its subtree'
);
select results_eq(
  $$ select hts_code from search_hts_lines(null, '64') $$,
  array['6402', '640299', '6402993160', '6403'],
  'a chapter returns all its lines'
);
select is(
  (select count(*)::int from search_hts_lines(null, '6404')),
  0, 'a code with no lines returns nothing'
);

select is(
  (select parents from search_hts_lines(null, '6402993160')),
  '[{"code": "6402", "description": "Other footwear with outer soles and uppers of rubber or plastics:"},
    {"code": "640299", "description": "Other:"}]'::jsonb,
  'each line returns its numbered parent lines, outermost first'
);
select is(
  (select row(hts_code, units, general_rate, total_count)::text from search_hts_lines(null, '6402993160')),
  row('6402993160', '{prs.}'::text[], '6%', 1::bigint)::text,
  'each line returns its units, general rate and the match count'
);

select results_eq(
  $$ select hts_code, has_children from search_hts_lines(null, '6402') $$,
  $$ values ('6402', true), ('640299', true), ('6402993160', false) $$,
  'each line says whether longer codes sit under it'
);
select ok(
  (select may_apply @> '[{"key": "section_232_metals", "origins": null}]' from search_hts_lines(null, '7318155000')),
  'a program whose HTS trigger covers the line may apply, for any origin'
);
select ok(
  (select may_apply @> '[{"key": "section_301_china", "origins": ["CN"]}]' from search_hts_lines(null, '7318155000')),
  'a program whose listed scope covers the line may apply, with its origins'
);
select ok(
  (select may_apply @> '[{"key": "section_301_china"}]' from search_hts_lines(null, '6402') where hts_code = '6402'),
  'a heading shows a program whose scope lists lines under it'
);
select ok(
  not exists (
    select 1 from search_hts_lines(array['footwear']) s, jsonb_array_elements(s.may_apply) b
    where b ->> 'key' in ('section_301_forced_labor', 'sanctioned_origins', 'section_338_canada')
  ),
  'programs that depend on origin alone are not listed'
);

select is(
  (select row(count(*), max(total_count))::text from search_hts_lines(null, '64', 2)),
  row(2::bigint, 4::bigint)::text,
  'the limit caps the rows; total_count still counts every match'
);

select throws_ok($$ select * from search_hts_lines(array['foot;wear']) $$, '22023', null, 'terms with punctuation are refused');
select throws_ok($$ select * from search_hts_lines(array['a','b','c','d','e','f','g','h','i']) $$, '22023', null, 'more than 8 terms are refused');
select throws_ok($$ select * from search_hts_lines(null, '6402.99') $$, '22023', null, 'a code must be digits only');
select throws_ok($$ select * from search_hts_lines() $$, '22023', null, 'a search needs terms or a code');

-- ---- A linked estimate with a looked-up code leaves the project alone ---------
reset role;
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c101', 'pgTAP Lookup Client');
insert into forwarder_projects (id, owner_id, client_id, hs_code) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-00000000c101', '6402.99.31.10');
create temp table project_before as
  select to_jsonb(p) as row from forwarder_projects p where id = '00000000-0000-4000-8000-000000000601';
grant select on project_before to authenticated;

-- Direct inserts by signed-in users are revoked (see 16); the estimate goes in
-- as the table owner, which is all this check needs: that saving a linked
-- estimate leaves the project row alone.
select lives_ok(
  $$ insert into duty_estimates (
       created_by, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd,
       base_duty_usd, fees_usd, total_usd, lines, forwarder_project_id, input_snapshot
     ) values (
       '00000000-0000-4000-8000-0000000000a1', '2026-10-05', '6402993160', 'Other', 'pgTAPLookup1', 'general', '6%', 'VN', 'Sea',
       10000, 10000, 600, 47.14, 647.14, '[]', '00000000-0000-4000-8000-000000000601',
       '{"project": {"hs_code": "6402.99.31.10"}}'
     ) $$,
  'a linked estimate with a code chosen in HTS lookup is stored'
);
select is(
  (select to_jsonb(p) from forwarder_projects p where id = '00000000-0000-4000-8000-000000000601'),
  (select row from project_before),
  'the project row (its HS code included) is unchanged'
);
reset role;

-- ---- Anon ----------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'search_hts_lines(text[], text, integer)', 'execute')
    and has_function_privilege('authenticated', 'search_hts_lines(text[], text, integer)', 'execute'),
  'only signed-in users can execute the search'
);
set local role anon;
select throws_ok($$ select * from search_hts_lines(array['footwear']) $$, '42501', null, 'anon cannot search');
reset role;

select * from finish();
rollback;
