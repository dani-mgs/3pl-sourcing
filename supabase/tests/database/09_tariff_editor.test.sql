-- The tariff-editor permission: app_metadata.tariff_editor (granted by
-- admins through the service role) lets a user maintain duty and fee data
-- and nothing else extra. is_tariff_editor() is true for editors and admins.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- ---- Duty data -> Fees reads who changed a fee, and its history ------------
-- As the editor still: the audit columns, the fee rows' history and display
-- names are readable (no migration needed for the Changes column).
select is(
  (select updated_by from customs_fees where fee_code = 'mpf_formal' and effective_to = '2027-09-30'),
  '00000000-0000-4000-8000-0000000000e1'::uuid, 'end-dating is stamped as the editor''s change, and the editor can read it'
);
select ok(
  (select updated_at > created_at from customs_fees where fee_code = 'mpf_formal' and effective_to = '2027-09-30'),
  'end-dating moves updated_at past created_at'
);
select is(
  (select array_agg(operation order by operation) from tariff_data_history
   where table_name = 'customs_fees' and changed_by = '00000000-0000-4000-8000-0000000000e1'),
  array['INSERT', 'UPDATE'], 'a tariff editor can read the fee history: the end-date and the new row, in their name'
);
select ok(
  (select new_row ->> 'effective_to' = '2027-09-30' and old_row ->> 'effective_to' is null
   from tariff_data_history where table_name = 'customs_fees' and operation = 'UPDATE'
     and changed_by = '00000000-0000-4000-8000-0000000000e1'),
  'the end-date history row holds the old and new end date'
);
select is(
  (select count(*)::int from profiles where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000ad')),
  2, 'a tariff editor can read the profiles behind the names'
);
reset role;

-- A client user (even one claiming tariff_editor) reads none of it.
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'Client');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","tariff_editor":true}');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1', '{"role":"client"}');
select is(
  (select count(*)::int from customs_fees) + (select count(*)::int from tariff_data_history where table_name = 'customs_fees'),
  0, 'a client user reads no fee rows and no fee history'
);
select is((select count(*)::int from profiles), 0, 'a client user reads no profiles');

select * from finish();
rollback;
