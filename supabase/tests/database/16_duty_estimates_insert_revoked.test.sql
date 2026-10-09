-- Direct inserts into duty_estimates are revoked (migration 20261006151253):
-- a signed-in user or anon can't insert one through the API, even a row the
-- old insert policy would have accepted. Estimates are saved only through
-- save_duty_estimate() as the service role, which still works. Reading and
-- deleting are unchanged, saved estimates are still locked, and nobody but
-- the service role can execute the function. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.payload(p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'as_of_date', (now() at time zone 'utc')::date, 'hts_code', '6402993110', 'hts_description', 'House slippers',
    'hts_ancestor_descriptions', '[]'::jsonb, 'hts_release_name', 'pgTAPRevoke1', 'rate_column', 'general',
    'rate_text', '6%', 'origin_country', 'VN', 'shipment_mode', 'Sea',
    'customs_value_original', 10000, 'original_currency', 'USD', 'exchange_rate_to_usd', 1,
    'customs_value_usd', 10000, 'base_duty_usd', 600, 'additional_duties_usd', 0, 'fees_usd', 47.14,
    'total_usd', 647.14,
    'lines', '[{"kind":"duty","amountUsd":600},{"kind":"fee","amountUsd":47.14}]'::jsonb,
    'warnings', '[]'::jsonb, 'duty_reviews', '[]'::jsonb
  ) || p_overrides;
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c601', 'pgTAP Client');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c601');
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e501', 'pgTAPRevoke1', 'current', 100, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, general_rate) values
  ('00000000-0000-4000-8000-00000000e501', '6402993110', '64', 2, 'House slippers', '6%');

-- ---- What is granted -----------------------------------------------------------------
select set_eq(
  -- Permissive only: the restrictive role policy (pgTAP 24) grants nothing.
  $$ select polcmd::text from pg_policy where polrelid = 'public.duty_estimates'::regclass and polpermissive $$,
  array['r', 'd'],
  'duty_estimates has a read and a delete policy and no insert policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.duty_estimates', 'INSERT')
    and not has_table_privilege('anon', 'public.duty_estimates', 'INSERT'),
  'authenticated and anon hold no INSERT on duty_estimates'
);
select ok(
  has_table_privilege('authenticated', 'public.duty_estimates', 'SELECT')
    and has_table_privilege('authenticated', 'public.duty_estimates', 'DELETE')
    and not has_table_privilege('authenticated', 'public.duty_estimates', 'UPDATE'),
  'authenticated still reads and deletes, and still can''t update'
);
select ok(
  not has_function_privilege('anon', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'save_duty_estimate(uuid, jsonb)', 'execute'),
  'only the service role can execute save_duty_estimate'
);

-- ---- Direct inserts are denied ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
-- Rows the old policy accepted: created_by is the caller; a linked one is for
-- the caller's own project.
select throws_ok(
  $$ insert into duty_estimates (created_by, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines)
     values ('00000000-0000-4000-8000-0000000000a1', current_date, '6402993110', 'House slippers', 'pgTAPRevoke1',
       'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]') $$,
  '42501', null, 'a signed-in user''s direct insert is denied'
);
select throws_ok(
  $$ insert into duty_estimates (created_by, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines,
       forwarder_project_id, input_snapshot)
     values ('00000000-0000-4000-8000-0000000000a1', current_date, '6402993110', 'House slippers', 'pgTAPRevoke1',
       'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]',
       '00000000-0000-4000-8000-000000000801', '{"project":{}}') $$,
  '42501', null, 'including a linked estimate on their own project'
);
select throws_ok(
  $$ insert into duty_estimates (as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines)
     values (current_date, '6402993110', 'House slippers', 'pgTAPRevoke1',
       'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]') $$,
  '42501', null, 'with created_by left to its default as well'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload()) $$,
  '42501', null, 'a signed-in user can''t run save_duty_estimate either'
);
reset role;

set local role anon;
select throws_ok(
  $$ insert into duty_estimates (created_by, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines)
     values ('00000000-0000-4000-8000-0000000000a1', current_date, '6402993110', 'House slippers', 'pgTAPRevoke1',
       'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]') $$,
  '42501', null, 'anon''s direct insert is denied'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload()) $$,
  '42501', null, 'anon can''t run save_duty_estimate'
);
reset role;
select is((select count(*)::int from duty_estimates), 0, 'no row got in');

-- ---- The app's path still works --------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"label":"one"}')) $$,
  'save_duty_estimate as the service role still saves an estimate'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"label":"two","forwarder_project_id":"00000000-0000-4000-8000-000000000801","input_snapshot":{"project":{}}}')) $$,
  'including one linked to the owner''s project'
);
reset role;
select is(
  (select created_by from duty_estimates where label = 'one'),
  '00000000-0000-4000-8000-0000000000a1'::uuid, 'created_by is the user it was saved for'
);

-- ---- Reading, deleting and the lock are unchanged ---------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is((select count(*)::int from duty_estimates), 2, 'another signed-in user still reads estimates');
select is_empty(
  $$ delete from duty_estimates where label = 'one' returning id $$,
  'a non-owner still can''t delete one'
);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ update duty_estimates set label = 'edited' where label = 'one' $$,
  '42501', null, 'a saved estimate is still locked'
);
select isnt_empty(
  $$ delete from duty_estimates where label = 'one' returning id $$,
  'the owner still deletes their estimate'
);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');
select isnt_empty(
  $$ delete from duty_estimates where label = 'two' returning id $$,
  'an admin still deletes anyone''s estimate'
);
reset role;

select * from finish();
rollback;
