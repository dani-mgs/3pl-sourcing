-- The tariff-editor permission: app_metadata.tariff_editor (granted by
-- admins through the service role) lets a user maintain duty and fee data
-- and nothing else extra. is_tariff_editor() is true for editors and admins.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.act_as(uid uuid, meta jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', meta)::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

-- ---- The profile mirror follows app_metadata --------------------------------
select is((select tariff_editor from profiles where email = 'editor@test.local'), true, 'a granted editor shows on profiles');
select is((select tariff_editor from profiles where email = 'expert@test.local'), false, 'a plain user is not an editor on profiles');
update auth.users set raw_app_meta_data = raw_app_meta_data - 'tariff_editor' where email = 'editor@test.local';
select is((select tariff_editor from profiles where email = 'editor@test.local'), false, 'revoking clears the profile flag');
select is((select role from profiles where email = 'editor@test.local'), 'logistics_expert', 'the role is untouched by revoking');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"tariff_editor":true}' where email = 'editor@test.local';
select is((select tariff_editor from profiles where email = 'editor@test.local'), true, 'granting again sets it');

-- ---- is_tariff_editor() ------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select is(is_tariff_editor(), false, 'a plain user is not a tariff editor');
reset role;
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"tariff_editor":"yes"}' where email = 'expert@test.local';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select is(is_tariff_editor(), false, 'only the boolean true counts');
reset role;
update auth.users set raw_app_meta_data = raw_app_meta_data - 'tariff_editor' where email = 'expert@test.local';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', '{"role":"admin"}');
select is(is_tariff_editor(), true, 'an admin counts as a tariff editor');

-- ---- Plain user: no fee writes ---------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select throws_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, effective_from, source_label, source_url)
     values ('hmf', 'x', 0.5, '2030-01-01', 'x', 'https://example.gov/') $$,
  '42501', null, 'a plain user cannot add a fee'
);
select is_empty($$ update customs_fees set notes = 'x' where fee_code = 'hmf' returning id $$, 'a plain user cannot change a fee');

-- ---- Tariff editor: fees yes; programs, column 2, profiles, HTS no ----------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select is(is_tariff_editor(), true, 'a granted user is a tariff editor');
select isnt_empty(
  $$ update customs_fees set effective_to = '2027-09-30' where fee_code = 'mpf_formal' returning id $$,
  'a tariff editor can end-date a fee row'
);
select lives_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, min_usd, max_usd, effective_from, source_label, source_url)
     values ('mpf_formal', 'MPF FY2028', 0.3464, 35.5, 690, '2027-10-01', 'FR', 'https://example.gov/') $$,
  'a tariff editor can add a fee row'
);
select is(
  (select created_by from customs_fees where effective_from = '2027-10-01'),
  '00000000-0000-4000-8000-0000000000e1'::uuid, 'the editor is recorded as its author'
);
select is_empty($$ update duty_programs set warning_text = 'x' returning key $$, 'a tariff editor cannot change duty programs');
select throws_ok(
  $$ insert into hts_column2_countries (country_code, source_label, source_url) values ('XX', 'x', 'https://example.gov/') $$,
  '42501', null, 'a tariff editor cannot change column 2 countries'
);
select throws_ok(
  $$ update profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'a tariff editor cannot change profiles'
);
select throws_ok($$ delete from hts_lines $$, '42501', null, 'a tariff editor cannot write HTS data');
select throws_ok(
  $$ select activate_hts_release('00000000-0000-4000-8000-000000000000', 0) $$,
  '42501', null, 'a tariff editor cannot activate an HTS release'
);

select * from finish();
rollback;
