-- The Market Report (Phase 2c). Reports and partner labels are staff-only
-- tables; clients read only the latest report per project, only through
-- my_market_reports(), and only while on the paid plan. Staff "View as
-- client" gets exactly the client's answer. Labels are stable, never reused
-- and survive a deleted forwarder. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.act_as_forged(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated',
    'user_metadata', json_build_object('role', 'client', 'client_id', '00000000-0000-4000-8000-00000000c001'),
    'app_metadata', json_build_object('role', 'client', 'client_id', '00000000-0000-4000-8000-00000000c001'))::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Report Paid'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Report Free'),
  ('00000000-0000-4000-8000-00000000c003', 'pgTAP Report Expired'),
  ('00000000-0000-4000-8000-00000000c004', 'pgTAP Report Paid Until'),
  ('00000000-0000-4000-8000-00000000c005', 'pgTAP Report No Row');
insert into client_entitlements (client_id, tier, valid_until) values
  ('00000000-0000-4000-8000-00000000c001', 'market_report', null),
  ('00000000-0000-4000-8000-00000000c002', 'free', null),
  ('00000000-0000-4000-8000-00000000c003', 'market_report', now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000c004', 'market_report', now() + interval '30 days');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'paid@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'free@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c3', 'expired@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c003"}', '{}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 'forged@test.local', '{}',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}');

insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c003'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-000000000401', 'Named Shortlisted Co'),
  ('00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-000000000401', 'Secret Two Freight'),
  ('00000000-0000-4000-8000-0000000f0003', '00000000-0000-4000-8000-000000000401', 'Secret Three Freight'),
  ('00000000-0000-4000-8000-0000000f0004', '00000000-0000-4000-8000-000000000401', 'Secret Four Freight'),
  ('00000000-0000-4000-8000-0000000f0005', '00000000-0000-4000-8000-000000000401', 'Secret Five Freight'),
  ('00000000-0000-4000-8000-0000000f0009', '00000000-0000-4000-8000-000000000402', 'Other Project Freight');

-- Reports written as the local seed would (no signed-in user), so the dates
-- can be in the past.
select set_config('request.jwt.claims', '', true);
insert into client_market_reports (forwarder_project_id, payload, published_at) values
  ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","project":{"route":"OLD-REPORT"}}', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","project":{"route":"Paid latest"}}', '2026-10-01'),
  ('00000000-0000-4000-8000-000000000404', '{"v":1,"kind":"market_report","project":{"route":"Paid second"}}', '2026-09-20'),
  ('00000000-0000-4000-8000-000000000402', '{"v":1,"kind":"market_report","project":{"route":"FREE-CANARY"}}', '2026-10-01'),
  ('00000000-0000-4000-8000-000000000403', '{"v":1,"kind":"market_report","project":{"route":"EXPIRED-CANARY"}}', '2026-10-01');

-- ---- Structure and grants ------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p where p.oid in ('public.client_has_paid_tier(uuid)'::regprocedure, 'public.market_report_rows(uuid)'::regprocedure,
                                  'public.my_market_reports()'::regprocedure, 'public.market_reports_for_client(uuid)'::regprocedure)),
  array['client_has_paid_tier:true:search_path=""', 'market_report_rows:true:search_path=""',
        'market_reports_for_client:true:search_path=""', 'my_market_reports:true:search_path=""'],
  'the four read functions are security definer with an empty search_path');
select ok(
  (select bool_and(not p.prosecdef and p.proconfig = array['search_path=""'])
   from pg_proc p where p.oid in ('public.assign_partner_labels(uuid,uuid[])'::regprocedure,
                                  'public.market_report_label_at(integer)'::regprocedure,
                                  'public.market_report_payload_ok(jsonb)'::regprocedure)),
  'assigning labels runs with the caller''s rights (RLS applies)');
select ok(
  not has_function_privilege('anon', 'public.client_has_paid_tier(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.market_report_rows(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_market_reports()', 'execute')
    and not has_function_privilege('anon', 'public.market_reports_for_client(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.assign_partner_labels(uuid,uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.market_report_label_at(integer)', 'execute')
    and not has_function_privilege('anon', 'public.market_report_payload_ok(jsonb)', 'execute'),
  'anon can call none of the new functions');
select ok(not has_function_privilege('authenticated', 'public.market_report_rows(uuid)', 'execute'),
  'signed-in users can''t call the internal query');
select is(
  pg_get_function_result('public.my_market_reports()'::regprocedure),
  'TABLE(engagement_key text, published_at timestamp with time zone, payload jsonb)',
  'a client gets exactly these columns: no report, project, client or staff ids, no inputs');
select is(
  pg_get_function_result('public.market_reports_for_client(uuid)'::regprocedure),
  'TABLE(engagement_key text, published_at timestamp with time zone, payload jsonb)',
  'the staff twin returns the same columns');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.client_market_reports'::regclass, 'public.market_report_partner_labels'::regclass)),
  'row-level security is on for both tables');
select ok(
  not has_table_privilege('anon', 'public.client_market_reports', 'select,insert,update,delete')
    and not has_table_privilege('anon', 'public.market_report_partner_labels', 'select,insert,update,delete'),
  'anon has no rights on either table');
select ok(
  not has_table_privilege('authenticated', 'public.client_market_reports', 'update')
    and not has_table_privilege('authenticated', 'public.market_report_partner_labels', 'update,delete'),
  'nobody signed in can update a report, or update or delete a label');

-- ---- The paid-plan check ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select is(
  array[client_has_paid_tier(null), client_has_paid_tier('00000000-0000-4000-8000-00000000c005'),
        client_has_paid_tier('00000000-0000-4000-8000-00000000c002'), client_has_paid_tier('00000000-0000-4000-8000-00000000c003'),
        client_has_paid_tier('00000000-0000-4000-8000-00000000c001'), client_has_paid_tier('00000000-0000-4000-8000-00000000c004')],
  array[false, false, false, false, true, true],
  'staff: no client, no row, free and expired are unpaid; no end date and a future end date are paid');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select ok(client_has_paid_tier('00000000-0000-4000-8000-00000000c001'), 'a paid client: its own plan is paid');
select ok(not client_has_paid_tier('00000000-0000-4000-8000-00000000c004'),
  'but it can''t learn another client''s plan (that one is paid too)');
reset role;

-- ---- Reports: fixed client, immutable, allow-listed top-level keys -----------------------
select is(
  (select client_id from client_market_reports where payload -> 'project' ->> 'route' = 'Paid latest'),
  '00000000-0000-4000-8000-00000000c001'::uuid, 'the client is the project''s');
select throws_ok(
  $$ update client_market_reports set payload = '{"v":1,"kind":"market_report"}' where payload -> 'project' ->> 'route' = 'Paid latest' $$,
  'P0001', null, 'a published report can''t be changed, even by the table owner');
select throws_ok(
  $$ insert into client_market_reports (forwarder_project_id, payload)
     values ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","notes":"x"}') $$,
  '23514', null, 'a top-level key outside the allow-list is refused');
select throws_ok(
  $$ insert into client_market_reports (forwarder_project_id, payload)
     values ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"forwarder"}') $$,
  '23514', null, 'so is a payload of another kind');
select throws_ok(
  $$ update forwarder_projects set client_id = '00000000-0000-4000-8000-00000000c002' where id = '00000000-0000-4000-8000-000000000404' $$,
  'P0001', null, 'a project with a published report keeps its client');

-- ---- A paid client: the latest report per project, its own only ------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select payload -> 'project' ->> 'route' from my_market_reports() $$,
  $$ values ('Paid latest'), ('Paid second') $$,
  'a paid client gets the latest report of each of its projects, newest first');
select is_empty($$ select 1 from my_market_reports() where payload::text like '%OLD-REPORT%' $$,
  'never an older report of the same project');
select is_empty($$ select 1 from my_market_reports() where payload::text ~ 'FREE-CANARY|EXPIRED-CANARY' $$,
  'never another client''s');
select is(
  (select engagement_key from my_market_reports() where payload -> 'project' ->> 'route' = 'Paid latest'),
  md5('client-update:00000000-0000-4000-8000-00000000c001:00000000-0000-4000-8000-000000000401'),
  'the key is the project''s opaque portal key');
select is_empty($$ select 1 from client_market_reports $$, 'the reports table gives a client nothing');
select is_empty($$ select 1 from market_report_partner_labels $$, 'nor does the labels table');
select throws_ok(
  $$ insert into client_market_reports (forwarder_project_id, payload)
     values ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report"}') $$,
  '42501', null, 'a client can''t publish a report');
select throws_ok(
  $$ insert into market_report_partner_labels (forwarder_project_id, forwarder_id, label)
     values ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0002', 'Q') $$,
  '42501', null, 'or write a label');
select throws_ok(
  $$ select * from assign_partner_labels('00000000-0000-4000-8000-000000000401', array['00000000-0000-4000-8000-0000000f0002'::uuid]) $$,
  '42501', null, 'or assign one');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$,
  'the staff twin gives a client nothing for its own id');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c002') $$,
  'or another client''s');
select throws_ok($$ select * from market_report_rows('00000000-0000-4000-8000-00000000c002') $$, '42501', null,
  'and it can''t call the internal query with another client''s id');
reset role;

create temp table paid_rows as
  select engagement_key, payload from public.market_report_rows('00000000-0000-4000-8000-00000000c001');
grant select on paid_rows to authenticated;

-- ---- Free and expired clients get nothing ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select is_empty($$ select 1 from my_market_reports() $$, 'a free client gets no report, though one is published for it');
select ok(not client_has_paid_tier('00000000-0000-4000-8000-00000000c002'), 'and its own plan reads as unpaid');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is_empty($$ select 1 from my_market_reports() $$, 'an expired client gets no report');
reset role;

-- ---- Expiring and re-entitling flip it ---------------------------------------------------------------
select pg_temp.as_postgres();
update client_entitlements set valid_until = now() - interval '1 minute' where client_id = '00000000-0000-4000-8000-00000000c001';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is_empty($$ select 1 from my_market_reports() $$, 'expiring the paid plan locks the report straight away');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$,
  'and View as client shows the same: nothing');
reset role;
select pg_temp.as_postgres();
update client_entitlements set valid_until = null where client_id = '00000000-0000-4000-8000-00000000c001';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select set_eq($$ select engagement_key, payload from my_market_reports() $$, $$ select * from pg_temp.paid_rows $$,
  're-entitling unlocks it again');
reset role;
select pg_temp.as_postgres();
update client_entitlements set tier = 'market_report' where client_id = '00000000-0000-4000-8000-00000000c002';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select results_eq($$ select payload -> 'project' ->> 'route' from my_market_reports() $$, $$ values ('FREE-CANARY') $$,
  'upgrading a free client unlocks its own report');
reset role;
select pg_temp.as_postgres();
update client_entitlements set tier = 'free' where client_id = '00000000-0000-4000-8000-00000000c002';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select is_empty($$ select 1 from my_market_reports() $$, 'and moving it back to free locks it');
reset role;

-- ---- Staff: View as client ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select set_eq(
  $$ select engagement_key, payload from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$,
  $$ select * from pg_temp.paid_rows $$,
  'staff get exactly the paid client''s rows');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c002') $$,
  'and nothing for a free client, exactly like the client');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c003') $$, 'or an expired one');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c001') where payload::text like '%OLD-REPORT%' $$,
  'never an older report, through the staff twin either');
select is_empty($$ select 1 from my_market_reports() $$, 'staff have no client of their own');
select throws_ok($$ select * from market_report_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'staff can''t call the internal query either');
reset role;

-- A newer report replaces the older one for the client.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into client_market_reports (forwarder_project_id, payload, published_at, published_by)
values ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","project":{"route":"Paid newest"}}',
        '2020-01-01', '00000000-0000-4000-8000-0000000000ad');
select is(
  (select array[published_by::text, (published_at = now())::text] from client_market_reports
   where payload -> 'project' ->> 'route' = 'Paid newest'),
  array['00000000-0000-4000-8000-0000000000a1', 'true'],
  'publishing as staff: the author is the caller and the date is now, whatever is sent');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq($$ select payload -> 'project' ->> 'route' from my_market_reports() $$, $$ values ('Paid newest'), ('Paid second') $$,
  'publishing again replaces the report the client sees');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select results_eq(
  $$ select payload -> 'project' ->> 'route' from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$,
  $$ values ('Paid newest'), ('Paid second') $$,
  'and View as client shows the same latest ones');
select throws_ok(
  $$ insert into client_market_reports (forwarder_project_id, payload)
     values ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report"}') $$,
  '42501', null, 'an expert who doesn''t own the project can''t publish');
select is_empty($$ delete from client_market_reports returning 1 $$, 'nor remove a report (admins only)');
reset role;

-- ---- No role, a forged client_id, anon -------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is_empty($$ select 1 from my_market_reports() $$, 'an account without a role reads no report');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$, 'through either function');
reset role;

select pg_temp.act_as_forged('00000000-0000-4000-8000-0000000000f2');
select is_empty($$ select 1 from my_market_reports() $$, 'a forged client_id gets no report');
select is_empty($$ select 1 from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$, 'nor through the staff twin');
select ok(not client_has_paid_tier('00000000-0000-4000-8000-00000000c001'), 'nor a paid answer for the client it claims');
select is_empty($$ select 1 from client_market_reports $$, 'nor rows from the reports table');
select is_empty($$ select 1 from market_report_partner_labels $$, 'nor labels');
select throws_ok($$ select * from market_report_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'nor the internal query');
reset role;

set local role anon;
select throws_ok($$ select * from my_market_reports() $$, '42501', null, 'anon can''t call my_market_reports');
select throws_ok($$ select * from market_reports_for_client('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'or market_reports_for_client');
select throws_ok($$ select client_has_paid_tier('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'or client_has_paid_tier');
select throws_ok($$ select * from market_report_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'or the internal query');
reset role;

-- ---- Labels: stable, never reused, kept for a deleted forwarder ------------------------------------
select is(market_report_label_at(0) || market_report_label_at(1) || market_report_label_at(22) || ','
          || market_report_label_at(23) || ',' || market_report_label_at(48) || ',' || market_report_label_at(49),
  'DEZ,AA,AZ,BA', 'letters run D to Z, then AA, AB, ...');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select results_eq(
  $$ select forwarder_id::text, label from assign_partner_labels('00000000-0000-4000-8000-000000000401',
       array['00000000-0000-4000-8000-0000000f0003', '00000000-0000-4000-8000-0000000f0002']::uuid[]) $$,
  $$ values ('00000000-0000-4000-8000-0000000f0003', 'D'), ('00000000-0000-4000-8000-0000000f0002', 'E') $$,
  'first publish: letters in the order given, from D');
select results_eq(
  $$ select forwarder_id::text, label from assign_partner_labels('00000000-0000-4000-8000-000000000401',
       array['00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000f0004', '00000000-0000-4000-8000-0000000f0003']::uuid[]) $$,
  $$ values ('00000000-0000-4000-8000-0000000f0003', 'D'), ('00000000-0000-4000-8000-0000000f0002', 'E'),
            ('00000000-0000-4000-8000-0000000f0004', 'F') $$,
  'second publish: the same forwarder keeps the same letter; a new one gets the next');
select throws_ok(
  $$ select * from assign_partner_labels('00000000-0000-4000-8000-000000000401', array['00000000-0000-4000-8000-0000000f0009']::uuid[]) $$,
  'P0001', null, 'a forwarder from another project can''t be labelled here');
select throws_ok($$ update market_report_partner_labels set label = 'Z' $$, '42501', null, 'staff can''t change a label');
select throws_ok($$ delete from market_report_partner_labels $$, '42501', null, 'or delete one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select throws_ok(
  $$ select * from assign_partner_labels('00000000-0000-4000-8000-000000000401', array['00000000-0000-4000-8000-0000000f0005']::uuid[]) $$,
  '42501', null, 'an expert who doesn''t own the project can''t assign labels');
reset role;

select pg_temp.as_postgres();
select throws_ok($$ update market_report_partner_labels set label = 'Z' where label = 'D' $$, 'P0001', null,
  'a label can''t be changed even by the table owner');
delete from forwarders where id = '00000000-0000-4000-8000-0000000f0004';
select results_eq(
  $$ select label, forwarder_id is null from market_report_partner_labels
     where forwarder_project_id = '00000000-0000-4000-8000-000000000401' order by label $$,
  $$ values ('D', false), ('E', false), ('F', true) $$,
  'a deleted forwarder''s letter stays reserved');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select results_eq(
  $$ select forwarder_id::text, label from assign_partner_labels('00000000-0000-4000-8000-000000000401',
       array['00000000-0000-4000-8000-0000000f0005', '00000000-0000-4000-8000-0000000f0003']::uuid[]) $$,
  $$ values ('00000000-0000-4000-8000-0000000f0003', 'D'), ('00000000-0000-4000-8000-0000000f0002', 'E'),
            ('00000000-0000-4000-8000-0000000f0005', 'G') $$,
  'and is never reused: the next forwarder gets G, not F');
reset role;

-- ---- Admins remove reports ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select isnt_empty(
  $$ delete from client_market_reports where payload -> 'project' ->> 'route' = 'Paid newest' returning 1 $$,
  'an admin can remove a report');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq($$ select payload -> 'project' ->> 'route' from my_market_reports() $$, $$ values ('Paid latest'), ('Paid second') $$,
  'and the client sees the previous one again');
reset role;

select * from finish();
rollback;
