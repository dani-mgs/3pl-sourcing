-- Introduction requests and Market Report interest (Phase 3b), on the 3a
-- client_requests table. A paid client asks for an introduction only to a
-- requestable letter of the LATEST report of its own forwarder project (one
-- open request per letter, company-wide); a free client asks about the
-- paid plan once. The forwarder behind a letter never reaches a client, a
-- staff reply may not name it, and introductions disappear from the client's
-- reads off the paid plan. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

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

create function pg_temp.ekey(client uuid, project uuid) returns text language sql as $$
  select md5('client-update:' || client || ':' || project) $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Intro Paid'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Intro Free'),
  ('00000000-0000-4000-8000-00000000c003', 'pgTAP Intro Paid Two');
insert into client_entitlements (client_id, tier, valid_until) values
  ('00000000-0000-4000-8000-00000000c001', 'market_report', null),
  ('00000000-0000-4000-8000-00000000c002', 'free', null),
  ('00000000-0000-4000-8000-00000000c003', 'market_report', null);
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert","first_name":"Beah"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'other@test.local', '{"role":"logistics_expert","first_name":"Carlos"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a3', 'freeowner@test.local', '{"role":"logistics_expert","first_name":"Priya"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin","first_name":"Dana"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'maya@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","first_name":"Maya"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'owen@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","first_name":"Owen"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c3', 'tess@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002","first_name":"Tess"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c4', 'paid2@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c003","first_name":"Ana"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c5', 'new@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","must_change_password":true}', '{}'),
  ('00000000-0000-4000-8000-0000000000c6', 'newfree@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002","must_change_password":true}', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 'forged@test.local', '{}',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}');

insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c003'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-000000000401', 'Named Pick Co'),
  ('00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-000000000401', 'Secret Alpha Freight'),
  ('00000000-0000-4000-8000-0000000f0003', '00000000-0000-4000-8000-000000000401', 'Secret Bravo Lines'),
  ('00000000-0000-4000-8000-0000000f0004', '00000000-0000-4000-8000-000000000401', 'Secret Charlie Cargo'),
  ('00000000-0000-4000-8000-0000000f0005', '00000000-0000-4000-8000-000000000401', 'Old Only Freight'),
  ('00000000-0000-4000-8000-0000000f0006', '00000000-0000-4000-8000-000000000401', 'Secret Hotel Freight'),
  ('00000000-0000-4000-8000-0000000f0007', '00000000-0000-4000-8000-000000000402', 'Free Secret Freight'),
  ('00000000-0000-4000-8000-0000000f0008', '00000000-0000-4000-8000-000000000403', 'Two Secret Freight');
insert into market_report_partner_labels (forwarder_project_id, forwarder_id, label) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0002', 'D'),
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0003', 'E'),
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0004', 'F'),
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0005', 'G'),
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000f0006', 'H'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000f0007', 'D'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000f0008', 'D');

-- Reports as the local seed writes them (no signed-in user: past dates).
select set_config('request.jwt.claims', '', true);
insert into client_market_reports (forwarder_project_id, payload, published_at) values
  ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","project":{"route":"Older"},"partners":[
     {"name":"Named Pick Co","outcome":"recommended"},
     {"label":"Partner D","outcome":"quoted_not_selected","priceUsd":9800},
     {"label":"Partner G","outcome":"quoted_not_selected","priceUsd":9900}]}', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000401', '{"v":1,"kind":"market_report","project":{"route":"Latest"},"partners":[
     {"name":"Named Pick Co","outcome":"recommended"},
     {"label":"Partner D","outcome":"quoted_not_selected","priceUsd":9800,"leadMinDays":25,"leadMaxDays":30,"likeForLike":true},
     {"label":"Partner E","outcome":"different_terms","priceUsd":8700},
     {"label":"Partner H","outcome":"didnt_quote","priceUsd":null},
     {"label":"Partner F","outcome":"not_taken_forward"}]}', '2026-10-01'),
  ('00000000-0000-4000-8000-000000000402', '{"v":1,"kind":"market_report","partners":[{"label":"Partner D","outcome":"quoted_not_selected"}]}', '2026-10-01'),
  ('00000000-0000-4000-8000-000000000403', '{"v":1,"kind":"market_report","partners":[{"label":"Partner D","outcome":"quoted_not_selected"}]}', '2026-10-01');

create temp table keys (name text primary key, key text);
grant select, insert on keys to authenticated;
insert into keys values
  ('one', pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  ('one-empty', pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000404')),
  ('one-3pl', pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301')),
  ('free', pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000402')),
  ('two', pg_temp.ekey('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-000000000403')),
  ('two-as-one', pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000403'));
create function pg_temp.k(n text) returns text language sql as $$ select key from pg_temp.keys where name = n $$;

-- ---- Structure and grants ------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('submit_client_introduction', 'submit_market_report_interest',
     'client_request_caller', 'client_requests_check_caps', 'can_act_on_client_request')),
  array['can_act_on_client_request:false:search_path=""', 'client_request_caller:true:search_path=""',
        'client_requests_check_caps:true:search_path=""', 'submit_client_introduction:true:search_path=""',
        'submit_market_report_interest:true:search_path=""'],
  'the new functions: security definer with an empty search path (who-may-act runs with the caller''s rights)');
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('submit_client_introduction', 'submit_market_report_interest',
     'client_request_caller', 'client_requests_check_caps', 'can_act_on_client_request', 'my_client_requests',
     'client_requests_for_client', 'client_requests_rows')),
  'anon can call none of them');
select ok(not has_function_privilege('authenticated', 'public.client_request_caller()', 'execute')
          and not has_function_privilege('authenticated', 'public.client_requests_check_caps(uuid,uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.client_requests_rows(uuid,uuid)', 'execute'),
  'signed-in users can''t call the internal checks and query');

-- ---- Introductions: a paid client --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
create temp table intro_d as select * from submit_client_introduction(pg_temp.k('one'), 'D', null, false);
select is((select already_sent from intro_d), false, 'a paid client asks for an introduction to Partner D of the latest report');
select is(
  (select row(r.already_sent, r.request_key = d.request_key)::text
   from submit_client_introduction(pg_temp.k('one'), 'D', 'again', true) r, intro_d d),
  '(t,t)', 'asking again while it is open returns the open request');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select is(
  (select row(r.already_sent, r.request_key = d.request_key)::text
   from submit_client_introduction(pg_temp.k('one'), 'D', null, false) r, intro_d d),
  '(t,t)', 'one open request per letter for the whole company: a coworker gets the same one');
select is(
  (select already_sent from submit_client_introduction(pg_temp.k('one'), 'E', '  Do they cover Ontario?  ', true)),
  false, 'a different-terms partner can be asked for, with a note and a call');
select is(
  (select already_sent from submit_client_introduction(pg_temp.k('one'), 'H', null, false)),
  false, 'a partner that didn''t quote can be asked for');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'F', null, false) $$,
  'CQ422', null, 'a "Not taken forward" letter can''t be asked for');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'G', null, false) $$,
  'CQ409', null, 'a letter only in an older report is stale');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'Z', null, false) $$,
  'CQ422', null, 'a letter that doesn''t exist is invalid');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'Partner D', null, false) $$,
  'CQ422', null, 'only the bare letter is accepted');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'd', null, false) $$,
  'CQ422', null, 'lower case is invalid');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one-empty'), 'D', null, false) $$,
  'CQ422', null, 'a project of its own without a report has no letters');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one-3pl'), 'D', null, false) $$,
  'CQ403', null, 'a 3PL project has no Market Report');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('two'), 'D', null, false) $$,
  'CQ403', null, 'another client''s project key is refused');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('two-as-one'), 'D', null, false) $$,
  'CQ403', null, 'another client''s project hashed with its own client id is refused');
select throws_ok(
  format($$ select * from submit_client_introduction(pg_temp.k('one'), 'E', %L, false) $$, repeat('x', 501)),
  'CQ422', null, 'a note over 500 characters is refused');

select pg_temp.as_postgres();
select is(
  (select row(r.client_id, r.created_by, r.status, r.kind, r.three_pl_project_id is null, r.client_update_id is null,
              r.client_market_report_id = (select id from client_market_reports where payload -> 'project' ->> 'route' = 'Latest'))::text
   from client_requests r where r.forwarder_project_id = '00000000-0000-4000-8000-000000000401' and r.partner_label = 'D'),
  '(00000000-0000-4000-8000-00000000c001,00000000-0000-4000-8000-0000000000c1,sent,introduction,t,t,t)',
  'the database set the client, the author, the status and the report');
select is(
  (select decision_snapshot - 'reportPublishedAt' from client_requests
   where forwarder_project_id = '00000000-0000-4000-8000-000000000401' and partner_label = 'D'),
  '{"route":"Latest","partner":{"label":"Partner D","outcome":"quoted_not_selected","priceUsd":9800,"leadMinDays":25,"leadMaxDays":30,"likeForLike":true}}'::jsonb,
  'a frozen copy of the row the client saw (letter only, no name)');
select is(
  (select row(message, wants_call)::text from client_requests
   where forwarder_project_id = '00000000-0000-4000-8000-000000000401' and partner_label = 'E'),
  '("Do they cover Ontario?",t)', 'the note is trimmed and the call tick kept');

-- ---- Refused callers ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('free'), 'D', null, false) $$,
  'CQ403', null, 'a free client can''t ask for an introduction, even to its own project''s letter');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c5');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'E', null, false) $$,
  'CQ403', null, 'a client that must still change its password is refused');
select pg_temp.act_as_forged('00000000-0000-4000-8000-0000000000f2');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'E', null, false) $$,
  'CQ403', null, 'a client id in user_metadata (forgeable) gets nothing');
select throws_ok(
  $$ select * from submit_market_report_interest(null, false) $$,
  'CQ403', null, 'nor Market Report interest');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('one'), 'E', null, false) $$,
  'CQ403', null, 'staff aren''t clients');

select pg_temp.as_postgres();
update client_entitlements set valid_until = now() - interval '1 minute' where client_id = '00000000-0000-4000-8000-00000000c003';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select throws_ok(
  $$ select * from submit_client_introduction(pg_temp.k('two'), 'D', null, false) $$,
  'CQ403', null, 'an expired paid plan is refused');
select pg_temp.as_postgres();
update client_entitlements set valid_until = null where client_id = '00000000-0000-4000-8000-00000000c003';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select is((select already_sent from submit_client_introduction(pg_temp.k('two'), 'D', null, false)), false,
  'the other paid client asks for its own Partner D (letters are per project)');

-- ---- Market Report interest: free plan, once ---------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select throws_ok(
  format($$ select * from submit_market_report_interest(%L, false) $$, repeat('x', 501)),
  'CQ422', null, 'an interest note over 500 characters is refused');
create temp table interest as select * from submit_market_report_interest('  What does it cost?  ', true);
select is((select already_sent from interest), false, 'a free client asks about the Market Report');
select is(
  (select row(r.already_sent, r.request_key = i.request_key)::text from submit_market_report_interest(null, false) r, interest i),
  '(t,t)', 'asking again returns the first one');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok(
  $$ select * from submit_market_report_interest(null, false) $$,
  'CQ409', null, 'a paid client can''t (its page is out of date)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c6');
select throws_ok(
  $$ select * from submit_market_report_interest(null, false) $$,
  'CQ403', null, 'a free client that must still change its password is refused');
select pg_temp.as_postgres();
select is(
  (select row(client_id, kind, message, wants_call, three_pl_project_id, forwarder_project_id, decision_snapshot, partner_label)::text
   from client_requests where kind = 'report_interest' and client_id = '00000000-0000-4000-8000-00000000c002'),
  '(00000000-0000-4000-8000-00000000c002,report_interest,"What does it cost?",t,,,,)',
  'interest is the client''s, with no project, snapshot or letter');

-- ---- The rate caps count every kind ---------------------------------------------------------------
insert into client_requests (forwarder_project_id, kind, message, created_by, created_at)
select '00000000-0000-4000-8000-000000000404', 'question', 'filler ' || g, '00000000-0000-4000-8000-0000000000c1', now()
from generate_series(1, 9) g;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(
  (select already_sent from submit_client_introduction(pg_temp.k('one'), 'E', null, false)),
  true, 'at the cap an open request is still returned (nothing new is written)');
select throws_ok(
  $$ select * from submit_client_request('question', pg_temp.k('one'), null, 'one more?', false) $$,
  'CQ429', null, 'introductions count towards the 3a cap (10 per user per hour)');
select pg_temp.as_postgres();
delete from client_requests where message like 'filler %';

-- ---- What clients read ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select set_eq(
  $$ select kind, partner_label, engagement_key, project_kind from my_client_requests() $$,
  $$ values ('introduction', 'D', pg_temp.k('one'), 'forwarder'), ('introduction', 'E', pg_temp.k('one'), 'forwarder'),
            ('introduction', 'H', pg_temp.k('one'), 'forwarder') $$,
  'the paid client reads its introductions with the letter only');
select is_empty(
  $$ select 1 from my_client_requests() r where row_to_json(r)::text ~* 'secret|named pick' $$,
  'no forwarder name, and nothing of the other clients');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select results_eq(
  $$ select kind, engagement_key, project_kind, partner_label, message from my_client_requests() $$,
  $$ values ('report_interest', null::text, null::text, null::text, 'What does it cost?') $$,
  'the free client reads its interest, with no project key');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select results_eq(
  $$ select kind, partner_label from my_client_requests() $$,
  $$ values ('introduction', 'D') $$,
  'the other paid client reads only its own');

-- Off the paid plan, introductions disappear from the client's reads.
select pg_temp.as_postgres();
update client_entitlements set tier = 'free' where client_id = '00000000-0000-4000-8000-00000000c001';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is_empty($$ select 1 from my_client_requests() where kind = 'introduction' or partner_label is not null $$,
  'downgraded: no introduction rows, no letters');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is_empty($$ select 1 from client_requests_for_client('00000000-0000-4000-8000-00000000c001') where kind = 'introduction' $$,
  'View as client shows the same (none)');
select pg_temp.as_postgres();
update client_entitlements set tier = 'market_report' where client_id = '00000000-0000-4000-8000-00000000c001';

-- Staff "View as client" is exactly the client's answer.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
create temp table maya_rows as
  select request_key, kind, partner_label, message, status, from_first_name from my_client_requests();
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select set_eq(
  $$ select request_key, kind, partner_label, message, status, from_first_name from client_requests_for_client('00000000-0000-4000-8000-00000000c001') $$,
  $$ select * from maya_rows $$,
  'View as client (any staff member) returns the client''s rows');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is_empty($$ select 1 from client_requests_for_client('00000000-0000-4000-8000-00000000c001') $$,
  'a client calling the staff twin gets nothing');

-- No direct writes for clients.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok(
  $$ insert into client_requests (forwarder_project_id, kind, partner_label, decision_snapshot)
     values ('00000000-0000-4000-8000-000000000401', 'introduction', 'G', '{}') $$,
  '42501', null, 'a client can''t insert an introduction directly');
select is_empty($$ select 1 from market_report_partner_labels $$, 'a client can''t read the labels table');

-- ---- Staff: who acts, and the reply guard -------------------------------------------------------
select pg_temp.as_postgres();
create temp table ids as select id, kind, partner_label, client_id from client_requests
  where client_id in ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000c003');
grant select on ids to authenticated;
create function pg_temp.req(p_kind text, p_label text) returns uuid language sql as $$
  select id from pg_temp.ids where kind = p_kind and partner_label is not distinct from p_label
    and client_id = case when p_kind = 'report_interest' then '00000000-0000-4000-8000-00000000c002'::uuid
                         else '00000000-0000-4000-8000-00000000c001'::uuid end $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(
  (select l.label || '=' || f.company_name from client_requests r
   join market_report_partner_labels l on l.forwarder_project_id = r.forwarder_project_id and l.label = r.partner_label
   join forwarders f on f.id = l.forwarder_id where r.id = pg_temp.req('introduction', 'D')),
  'D=Secret Alpha Freight', 'staff resolve the letter through the staff-only labels table');
select is(my_client_request_badge(), 3, 'the owner''s badge counts the three new introductions');
select is(mark_client_request_seen(pg_temp.req('report_interest', null)), false,
  'Market Report interest: an owner of none of that client''s projects can''t mark it seen');
select throws_ok(
  $$ select reply_to_client_request(pg_temp.req('report_interest', null), 'Hello') $$,
  '42501', null, 'nor reply');
select throws_ok(
  $$ select reply_to_client_request(pg_temp.req('introduction', 'D'), 'Happy to introduce you to SECRET ALPHA freight next week.') $$,
  'CQ423', null, 'a reply that names the partner (any case) is refused');
select lives_ok(
  $$ select reply_to_client_request(pg_temp.req('introduction', 'D'), 'We have emailed you both an introduction.') $$,
  'a reply without the name goes through');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select throws_ok(
  $$ select reply_to_client_request(pg_temp.req('introduction', 'E'), 'Hi') $$,
  '42501', null, 'another expert can''t reply to an introduction on a project they don''t own');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
select is(my_client_request_badge(), 1, 'the owner of one of the free client''s projects sees the interest in the badge');
select is(mark_client_request_seen(pg_temp.req('report_interest', null)), true, 'and can open it (seen)');
select lives_ok(
  $$ select reply_to_client_request(pg_temp.req('report_interest', null), 'Thanks Tess, I will call you this week.') $$,
  'and reply to it');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select is(mark_client_request_seen(pg_temp.req('introduction', 'E')), true, 'an admin can act on any request');

-- ---- After an answer: a new request for the same letter; withdrawing ---------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
create temp table intro_d2 as select * from submit_client_introduction(pg_temp.k('one'), 'D', 'Still keen', false);
select is(
  (select row(n.already_sent, n.request_key <> d.request_key)::text from intro_d2 n, intro_d d),
  '(f,t)', 'once Move has answered, the letter can be asked for again (a new request)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select throws_ok(
  $$ select withdraw_client_request_reply(pg_temp.req('introduction', 'D')) $$,
  'CQ409', null, 'withdrawing the old reply is refused while a newer request for the letter is open');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is(
  (select reply from my_client_requests() where kind = 'report_interest'),
  'Thanks Tess, I will call you this week.', 'the free client reads Move''s reply to its interest');

-- ---- The table's own rules ----------------------------------------------------------------------
select pg_temp.as_postgres();
select throws_ok(
  $$ update client_requests set partner_label = 'E' where id = pg_temp.req('introduction', 'D') $$,
  'P0001', null, 'the letter can''t be changed, not even by the table owner');
select throws_ok(
  $$ update client_requests set decision_snapshot = '{"partner":{"label":"Partner E"}}' where id = pg_temp.req('introduction', 'D') $$,
  'P0001', null, 'nor the frozen copy');
select throws_ok(
  $$ insert into client_requests (forwarder_project_id, kind, partner_label, decision_snapshot)
     values ('00000000-0000-4000-8000-000000000401', 'introduction', 'E', '{}') $$,
  '23505', null, 'the database allows one open request per letter');
select throws_ok(
  $$ insert into client_requests (client_id, kind) values ('00000000-0000-4000-8000-00000000c002', 'report_interest') $$,
  '23505', null, 'and one Market Report interest per client');
select throws_ok(
  $$ insert into client_requests (forwarder_project_id, kind, decision_snapshot)
     values ('00000000-0000-4000-8000-000000000401', 'introduction', '{}') $$,
  '23514', null, 'an introduction needs a letter');
select throws_ok(
  $$ insert into client_requests (forwarder_project_id, kind) values ('00000000-0000-4000-8000-000000000402', 'report_interest') $$,
  '23514', null, 'interest is never tied to a project');
select throws_ok(
  $$ insert into client_requests (three_pl_project_id, kind, partner_label, decision_snapshot)
     values ('00000000-0000-4000-8000-000000000301', 'introduction', 'J', '{}') $$,
  '23514', null, 'an introduction is on a forwarder project only');

select * from finish();
rollback;
