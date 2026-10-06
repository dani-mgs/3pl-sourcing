-- Duty estimates linked to a forwarder project or quote (migration
-- 20261003011811): only the project's owner or an admin can save a linked
-- estimate, the quote must belong to the project, linked rows stay locked,
-- and deleting the quote or project deletes its estimates. Unlinked
-- estimates are unchanged. Estimates are saved the way the app saves them,
-- through save_duty_estimate() as the service role (direct inserts are
-- revoked, see 16). Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

-- A valid estimate payload for save_duty_estimate (10,000 of goods, 6% duty,
-- one fee), with overrides.
create function pg_temp.payload(p_overrides jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'as_of_date', (now() at time zone 'utc')::date, 'hts_code', '6402993110', 'hts_description', 'House slippers',
    'hts_ancestor_descriptions', '[]'::jsonb, 'hts_release_name', 'pgTAPLink1', 'rate_column', 'general',
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
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');
-- Project P1 (owned by a1) with forwarder F1 and quotes Q1, Q2; project P2
-- (owned by b1) with forwarder F2 and quote Q3.
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'F1'),
  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000411', 'F2');
insert into forwarder_quotes (id, forwarder_id, scenario_group) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000402', 'A'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000402', 'B'),
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000412', 'A');

-- The HTS line the payloads use, in a current release.
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000000e401', 'pgTAPLink1', 'current', 100, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description, general_rate) values
  ('00000000-0000-4000-8000-00000000e401', '6402993110', '64', 2, 'House slippers', '6%');

-- ---- Owner (a1) saves ------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload('{"label":"unlinked"}')) $$,
  'unlinked estimates are unchanged'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"label":"project","forwarder_project_id":"00000000-0000-4000-8000-000000000401","input_snapshot":{"project":{}}}')) $$,
  'the owner can link an estimate to their project'
);
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"label":"quote","forwarder_project_id":"00000000-0000-4000-8000-000000000401",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000501","input_snapshot":{"project":{}},
         "freight_insurance_deduction_usd":800,"customs_value_usd":9200,"base_duty_usd":552,"total_usd":599.14,
         "lines":[{"kind":"duty","amountUsd":552},{"kind":"fee","amountUsd":47.14}]}')) $$,
  'the owner can link an estimate to a quote in their project, with a deduction'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000411","input_snapshot":{"project":{}}}')) $$,
  '42501', null, 'a user cannot link an estimate to someone else''s project'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000401",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000511","input_snapshot":{"project":{}}}')) $$,
  '23514', null, 'the quote must belong to the linked project'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_quote_id":"00000000-0000-4000-8000-000000000501"}')) $$,
  '23514', null, 'a quote link needs a project link'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"freight_insurance_deduction_usd":500,"customs_value_usd":9500,"base_duty_usd":570,"total_usd":617.14,
         "lines":[{"kind":"duty","amountUsd":570},{"kind":"fee","amountUsd":47.14}]}')) $$,
  '23514', null, 'a deduction only exists on linked estimates'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000a1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000401"}')) $$,
  '23514', null, 'a linked estimate must keep its input snapshot'
);
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ update duty_estimates set input_snapshot = '{}' where label = 'quote' $$,
  '42501', null, 'a linked estimate is locked'
);

-- ---- Another user (b1): can't link to a1's project ---------------------------------
reset role;
set local role service_role;
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000b1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000401","input_snapshot":{"project":{}}}')) $$,
  '42501', null, 'a non-owner cannot link an estimate to the project'
);
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000b1', pg_temp.payload(
       '{"forwarder_project_id":"00000000-0000-4000-8000-000000000401",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000502","input_snapshot":{"project":{}}}')) $$,
  '42501', null, 'a non-owner cannot link an estimate to a quote in the project'
);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is(
  (select count(*)::int from duty_estimates where forwarder_project_id = '00000000-0000-4000-8000-000000000401'),
  2, 'a non-owner can still read the project''s estimates'
);

-- ---- Admin can link to anyone's project --------------------------------------------
reset role;
set local role service_role;
select lives_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000ad', pg_temp.payload(
       '{"label":"admin","forwarder_project_id":"00000000-0000-4000-8000-000000000401",
         "forwarder_quote_id":"00000000-0000-4000-8000-000000000502","input_snapshot":{"project":{}}}')) $$,
  'an admin can link an estimate to any project''s quote'
);
reset role;

-- ---- Cascades (as the project owner) -------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
delete from forwarder_quotes where id = '00000000-0000-4000-8000-000000000501';
select is(
  (select count(*)::int from duty_estimates where label = 'quote'),
  0, 'deleting a quote deletes its linked estimates'
);
delete from forwarders where id = '00000000-0000-4000-8000-000000000402';
select is(
  (select count(*)::int from duty_estimates where label = 'admin'),
  0, 'deleting a forwarder deletes the estimates linked to its quotes, including an admin''s'
);
delete from forwarder_projects where id = '00000000-0000-4000-8000-000000000401';
select is(
  (select count(*)::int from duty_estimates where label = 'project'),
  0, 'deleting a project deletes its linked estimates'
);
select is(
  (select count(*)::int from duty_estimates where label = 'unlinked'),
  1, 'unlinked estimates are untouched'
);

select * from finish();
rollback;
