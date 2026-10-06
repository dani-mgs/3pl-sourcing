-- save_duty_estimate() (migration 20261006145721): only the service role can
-- run it; it takes only an allow-list of fields, stamps created_by from the
-- user id it's given, and re-checks what the database can (who may link, the
-- current HTS line, release, rate and column, the stored exchange rate, the
-- customs value, the as-of date, that the lines add up). Direct inserts by
-- signed-in users still work at this step; the revoke is step 2. Rolled back
-- at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c501', 'pgTAP Client');
insert into forwarder_projects (id, owner_id, client_id, hs_code) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c501', '6402.99.31.10'),
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c501', null);
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000701', 'F1'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000711', 'F2');
insert into forwarder_quotes (id, forwarder_id, scenario_group) values
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000702', 'A'),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000712', 'A');

-- A current HTS release (a local database may hold a real import), and one
-- still importing that must never be accepted.
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e301', 'pgTAPSave1', 'current', 100, 1),
  ('00000000-0000-4000-8000-00000000e302', 'pgTAPSave2', 'importing', 3, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, ancestor_descriptions, units, general_rate, special_rate, other_rate) values
  ('00000000-0000-4000-8000-00000000e301', '6402993160', '64', 3, 'Other',
   '{"Other footwear:","Other:"}', '{prs.}', '6%', 'Free (A,AU)', '35%'),
  ('00000000-0000-4000-8000-00000000e302', '6402993170', '64', 3, 'Other (importing)', '{}', '{}', '6%', null, '35%');
insert into fx_rates (rate_date, currency, rate_to_usd) values (current_date, 'EUR', 1.08)
  on conflict (rate_date, currency) do update set rate_to_usd = excluded.rate_to_usd;

-- A valid USD estimate (10,000 of goods, 6% duty, one fee), with overrides.
create function pg_temp.payload(p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'as_of_date', (now() at time zone 'utc')::date, 'hts_code', '6402993160', 'hts_description', 'Other',
    'hts_ancestor_descriptions', '["Other footwear:","Other:"]'::jsonb,
    'hts_release_name', 'pgTAPSave1', 'rate_column', 'general', 'rate_text', '6%',
    'special_rate_text', 'Free (A,AU)', 'origin_country', 'VN', 'shipment_mode', 'Sea',
    'customs_value_original', 10000, 'original_currency', 'USD', 'exchange_rate_to_usd', 1,
    'customs_value_usd', 10000, 'base_duty_usd', 600, 'additional_duties_usd', 0, 'fees_usd', 47.14,
    'total_usd', 647.14,
    'lines', '[{"kind":"duty","amountUsd":600},{"kind":"fee","amountUsd":47.14}]'::jsonb,
    'warnings', '[]'::jsonb, 'duty_reviews', '[]'::jsonb
  ) || p_overrides;
$$;

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

-- ---- Who can run it -----------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'save_duty_estimate(uuid, jsonb)', 'execute'),
  'the service role can execute save_duty_estimate'
);
select ok(
  not has_function_privilege('anon', 'save_duty_estimate(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'save_duty_estimate(uuid, jsonb)', 'execute'),
  'anon and signed-in users cannot execute save_duty_estimate'
);
select ok(
  not (select exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.proname = 'save_duty_estimate' and a.grantee = 0
  )),
  'PUBLIC has no EXECUTE on save_duty_estimate (Postgres grants it by default)'
);
select ok(
  not has_function_privilege('authenticated', 'is_admin_user(uuid)', 'execute')
    and not has_function_privilege('anon', 'is_admin_user(uuid)', 'execute'),
  'nobody but the service role can ask is_admin_user'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload()) $$,
  '42501', null, 'a signed-in user calling the function directly is refused'
);
reset role;
set local role anon;
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload()) $$,
  '42501', null, 'anon calling the function is refused'
);
reset role;

-- ---- The service role saves ----------------------------------------------------
set local role service_role;
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"label":"first"}')) $$,
  'a valid unlinked estimate is saved'
);
reset role;
select is(
  (select created_by from duty_estimates where label = 'first'),
  '00000000-0000-4000-8000-0000000000a1'::uuid, 'created_by is the user id given, not the caller'
);
select is(
  (select total_usd from duty_estimates where label = 'first'), 647.14, 'the saved row carries the amounts'
);

set local role service_role;
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload('{"id":"00000000-0000-4000-8000-000000000999"}')) $$,
  '22023', null, 'an id in the payload is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload('{"created_by":"00000000-0000-4000-8000-0000000000b1"}')) $$,
  '22023', null, 'created_by in the payload is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload('{"created_at":"2020-01-01T00:00:00Z"}')) $$,
  '22023', null, 'created_at in the payload is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-000000000999', pg_temp.payload()) $$,
  '42501', null, 'an unknown user is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', '[1]'::jsonb) $$,
  '22023', null, 'a payload that isn''t an object is refused'
);

-- ---- Linking -------------------------------------------------------------------
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"label":"linked","forwarder_project_id":"00000000-0000-4000-8000-000000000701",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000703","input_snapshot":{"project":{}}}')) $$,
  'the project''s owner can link an estimate to their project and quote'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000b1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000701","input_snapshot":{"project":{}}}')) $$,
  '42501', null, 'a user who doesn''t own the project can''t link to it'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000ad', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000701","input_snapshot":{"project":{}}}')) $$,
  'an admin can link to any project'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000701",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000713","input_snapshot":{"project":{}}}')) $$,
  '23514', null, 'the quote must belong to the linked project'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000701"}')) $$,
  '23514', null, 'a linked estimate must keep its input snapshot'
);

-- ---- HTS line, release, rate ---------------------------------------------------
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"hts_description":"Anything"}')) $$,
  '23514', null, 'a description that isn''t the HTS line''s is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"hts_ancestor_descriptions":[]}')) $$,
  '23514', null, 'different ancestor descriptions are refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"hts_code":"6402993199"}')) $$,
  '23514', null, 'a code that isn''t in the current release is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload('{"hts_release_name":"pgTAPSave2","hts_code":"6402993170","hts_description":"Other (importing)","hts_ancestor_descriptions":[],"special_rate_text":null}')) $$,
  '23514', null, 'a release that isn''t current is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"rate_text":"0%"}')) $$,
  '23514', null, 'a rate text that isn''t the line''s general rate is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"origin_country":"CU"}')) $$,
  '23514', null, 'a column 2 country with the general rate column is refused'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"origin_country":"CU","rate_column":"column2","rate_text":"35%","base_duty_usd":3500,"fees_usd":47.14,"total_usd":3547.14,
         "lines":[{"kind":"duty","amountUsd":3500},{"kind":"fee","amountUsd":47.14}]}')) $$,
  'a column 2 country with its column 2 rate is accepted'
);

-- ---- Date -------------------------------------------------------------------------
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload(jsonb_build_object('as_of_date', (now() at time zone 'utc')::date - 1))) $$,
  'yesterday (UTC) is accepted, so a save across midnight works'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload(jsonb_build_object('as_of_date', (now() at time zone 'utc')::date - 2))) $$,
  '23514', null, 'two days ago is refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1',
       pg_temp.payload(jsonb_build_object('as_of_date', (now() at time zone 'utc')::date + 1))) $$,
  '23514', null, 'tomorrow is refused'
);

-- ---- Exchange rate and customs value --------------------------------------------
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       jsonb_build_object('original_currency','EUR','exchange_rate_to_usd',1.08,'exchange_rate_source','daily_feed',
         'exchange_rate_date', current_date, 'customs_value_usd',10800,'base_duty_usd',648,'total_usd',695.14,
         'lines','[{"kind":"duty","amountUsd":648},{"kind":"fee","amountUsd":47.14}]'::jsonb))) $$,
  'a daily-feed rate that is the stored one is accepted'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       jsonb_build_object('original_currency','EUR','exchange_rate_to_usd',2,'exchange_rate_source','daily_feed',
         'exchange_rate_date', current_date, 'customs_value_usd',20000,'base_duty_usd',1200,'total_usd',1247.14,
         'lines','[{"kind":"duty","amountUsd":1200},{"kind":"fee","amountUsd":47.14}]'::jsonb))) $$,
  '23514', null, 'a daily-feed rate that isn''t the stored one is refused'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       jsonb_build_object('original_currency','EUR','exchange_rate_to_usd',2,'exchange_rate_source','manual',
         'exchange_rate_date', current_date, 'customs_value_usd',20000,'base_duty_usd',1200,'total_usd',1247.14,
         'lines','[{"kind":"duty","amountUsd":1200},{"kind":"fee","amountUsd":47.14}]'::jsonb))) $$,
  'a manual rate is accepted (it is the user''s own, and labelled so)'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"customs_value_usd":1}')) $$,
  '23514', null, 'a customs value that isn''t the value times the rate is refused'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"customs_value_usd":9200,"freight_insurance_deduction_usd":800,"base_duty_usd":552,"total_usd":599.14,
         "forwarder_project_id":"00000000-0000-4000-8000-000000000701","input_snapshot":{"project":{}},
         "lines":[{"kind":"duty","amountUsd":552},{"kind":"fee","amountUsd":47.14}]}')) $$,
  'the customs value may be the value less a deduction (on a linked estimate)'
);

-- ---- Lines add up -----------------------------------------------------------------
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"lines":[{"kind":"duty","amountUsd":1},{"kind":"fee","amountUsd":47.14}]}')) $$,
  '23514', null, 'lines that don''t add up to the totals are refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"lines":{"kind":"duty"}}')) $$,
  '23514', null, 'lines that aren''t a list are refused'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"lines":[{"kind":"duty","amountUsd":600},{"kind":"duty","amountUsd":0},{"kind":"fee","amountUsd":47.14}]}')) $$,
  '23514', null, 'more than one base duty line is refused'
);

-- ---- Nothing else changed ----------------------------------------------------------
reset role;
select is(
  (select hs_code from forwarder_projects where id = '00000000-0000-4000-8000-000000000701'),
  '6402.99.31.10', 'saving a linked estimate never changes the project''s HS code'
);
select throws_ok(
  $$ update duty_estimates set label = 'edited' where label = 'first' $$,
  '42501', null, 'a saved estimate is still locked'
);

-- ---- is_admin_user agrees with is_admin() ------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');
select is(is_admin(), true, 'is_admin() sees an admin token');
reset role;
select is(is_admin_user('00000000-0000-4000-8000-0000000000ad'), true, 'is_admin_user agrees for an admin');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(is_admin(), false, 'is_admin() sees a non-admin token');
reset role;
select is(is_admin_user('00000000-0000-4000-8000-0000000000a1'), false, 'is_admin_user agrees for a non-admin');
select is(is_admin_user('00000000-0000-4000-8000-000000000999'), false, 'is_admin_user is false for an unknown user');

select * from finish();
rollback;
