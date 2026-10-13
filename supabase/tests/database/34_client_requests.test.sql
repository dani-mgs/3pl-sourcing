-- Client requests (Phase 3a). client_requests is staff-only: clients write
-- only through submit_client_request() (client, author, time and status
-- forced; stale, second and invalid decisions refused; must-change-password
-- refused; rate caps) and read only through my_client_requests() (safe
-- columns, never a withdrawn reply). Staff reply once (owner or admin);
-- admins can withdraw a reply. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(85);

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

-- Keys as the portal gives them to a client.
create function pg_temp.ekey(client uuid, project uuid) returns text language sql as $$
  select md5('client-update:' || client || ':' || project) $$;
-- Update keys are computed as postgres (clients can't read client_updates)
-- into a temp table the test roles can read.
create temp table ukeys (headline text primary key, update_id uuid);
grant select on ukeys to authenticated, anon;
create function pg_temp.refresh_ukeys() returns void language sql as $$
  insert into pg_temp.ukeys select headline, id from public.client_updates on conflict do nothing $$;
create function pg_temp.ukey(client uuid, headline text) returns text language sql as $$
  select md5('client-update-row:' || client || ':' || (select update_id from pg_temp.ukeys k where k.headline = ukey.headline)) $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Requests One'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Requests Two'),
  ('00000000-0000-4000-8000-00000000c003', 'pgTAP Requests Three');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert","first_name":"Beah Santos"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'other@test.local', '{"role":"logistics_expert","first_name":"Carlos"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin","first_name":"Dana"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'maya@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","first_name":"Maya Lopez"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'owen@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","first_name":"Owen"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c3', 'two@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002","first_name":"Tess"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c4', 'new@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c003","must_change_password":true}', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 'forged@test.local', '{}',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}');

insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c003');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');

select set_config('request.jwt.claims', '', true);
insert into client_updates (three_pl_project_id, forwarder_project_id, stage, headline, summary, payload, is_draft, published_at) values
  ('00000000-0000-4000-8000-000000000301', null, 5, 'One older', 'x', '{"v":1,"kind":"three_pl","recommendation":{"name":"Old Pick"}}', false, '2026-09-01'),
  ('00000000-0000-4000-8000-000000000301', null, 5, 'One latest', 'x', '{"v":1,"kind":"three_pl","recommendation":{"name":"Harborline"}}', false, '2026-10-01'),
  (null, '00000000-0000-4000-8000-000000000401', 3, 'One forwarder', 'x', '{"v":1,"kind":"forwarder","recommendation":null}', false, '2026-10-02'),
  ('00000000-0000-4000-8000-000000000302', null, 5, 'Two latest', 'x', '{"v":1,"kind":"three_pl","recommendation":{"name":"Other Pick"}}', false, '2026-10-01'),
  ('00000000-0000-4000-8000-000000000303', null, 5, 'Three latest', 'x', '{"v":1,"kind":"three_pl","recommendation":{"name":"Third Pick"}}', false, '2026-10-01');
select pg_temp.refresh_ukeys();

-- ---- Structure and grants ------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('submit_client_request', 'client_requests_rows', 'my_client_requests',
     'client_requests_for_client', 'mark_client_request_seen', 'reply_to_client_request', 'withdraw_client_request_reply',
     'my_client_request_badge')),
  array['client_requests_for_client:true:search_path=""', 'client_requests_rows:true:search_path=""',
        'mark_client_request_seen:true:search_path=""', 'my_client_request_badge:false:search_path=""',
        'my_client_requests:true:search_path=""', 'reply_to_client_request:true:search_path=""',
        'submit_client_request:true:search_path=""', 'withdraw_client_request_reply:true:search_path=""'],
  'the request functions: security definer with an empty search path (the badge runs with the caller''s rights)');
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('submit_client_request', 'client_requests_rows', 'my_client_requests',
     'client_requests_for_client', 'mark_client_request_seen', 'reply_to_client_request', 'withdraw_client_request_reply',
     'my_client_request_badge', 'portal_updates_rows', 'my_portal_updates', 'portal_updates_for_client')),
  'anon can call none of them');
select ok(not has_function_privilege('authenticated', 'public.client_requests_rows(uuid,uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.portal_updates_rows(uuid)', 'execute'),
  'signed-in users can''t call the internal queries');
select is(
  pg_get_function_result('public.my_client_requests()'::regprocedure),
  'TABLE(request_key text, engagement_key text, update_key text, project_kind text, kind text, message text, wants_call boolean, status text, created_at timestamp with time zone, from_first_name text, from_me boolean, decision_name text, reply text, replied_at timestamp with time zone, replier_first_name text, reply_withdrawn boolean, partner_label text)',
  'a client gets exactly these columns: no ids, no staff ids, no withdrawn replies (partner_label: Phase 3b, last)');
select is(
  pg_get_function_result('public.my_portal_updates()'::regprocedure),
  'TABLE(engagement_key text, project_kind text, stage smallint, headline text, summary text, next_step text, next_step_due date, needs_client_action boolean, published_at timestamp with time zone, payload jsonb, update_key text)',
  'the portal function gains update_key as its last column (the deployed code ignores it)');
select ok(
  has_table_privilege('authenticated', 'public.client_requests', 'select')
    and not has_table_privilege('authenticated', 'public.client_requests', 'insert,update,delete,truncate')
    and not has_table_privilege('anon', 'public.client_requests', 'select,insert,update,delete'),
  'signed-in users can only read the table (staff, through RLS); anon nothing');

-- ---- A client submits ----------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One older')),
  'CQ409', null, 'approving an update that is no longer the latest is refused (stale)');
create temp table first_approval as
  select * from submit_client_request('approve',
    pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
    pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest'), '  Start after our stocktake  ', true);
select is((select already_sent from first_approval), false, 'approving the latest update with a note works');
select is(
  (select row(r.already_sent, r.request_key = f.request_key)::text
   from submit_client_request('approve',
     pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
     pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest'), null, false) r, first_approval f),
  '(t,t)', 'approving it again returns the first approval');
select throws_ok(
  format($$ select * from submit_client_request('request_changes', %L, %L, 'West Coast option please', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest')),
  'CQ409', null, 'one decision per update: no change request after an approval');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One forwarder')),
  'CQ409', null, 'an update without a recommendation can''t be approved');
select isnt_empty(
  format($$ select * from submit_client_request('question', %L, null, 'Weekend delivery to Ontario?', true) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  'a question with "please call me" works');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, '   ', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  'CQ422', null, 'an empty question is refused');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, %L, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401'), repeat('x', 1001)),
  'CQ422', null, 'a question over 1,000 characters is refused');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, %L, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest'), repeat('x', 501)),
  'CQ422', null, 'a note over 500 characters is refused');
select throws_ok(
  format($$ select * from submit_client_request('call_me_maybe', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  'CQ422', null, 'an unknown kind is refused');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000302')),
  'CQ403', null, 'another client''s project key is refused');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302')),
  'CQ403', null, 'and so is another client''s project hashed with its own client id');
select throws_ok(
  $$ insert into client_requests (forwarder_project_id, kind, message) values ('00000000-0000-4000-8000-000000000401', 'question', 'x') $$,
  '42501', null, 'a client can''t insert into the table');
select throws_ok($$ update client_requests set message = 'x' $$, '42501', null, 'or update it');
select throws_ok($$ delete from client_requests $$, '42501', null, 'or delete from it');
select is_empty($$ select 1 from client_requests $$, 'reading the table directly gives a client nothing');
-- (Both were sent in this one transaction, so they share a timestamp.)
select set_eq(
  $$ select kind, message, wants_call, status, from_first_name, from_me, decision_name from my_client_requests() $$,
  $$ values ('question'::text, 'Weekend delivery to Ontario?'::text, true, 'sent'::text, 'Maya'::text, true, null::text),
            ('approve', 'Start after our stocktake', false, 'sent', 'Maya', true, 'Harborline') $$,
  'a client reads its requests: note trimmed, "call me" only on questions, first name only');
select ok(
  (select bool_and(request_key ~ '^[0-9a-f]{32}$' and engagement_key ~ '^[0-9a-f]{32}$') from my_client_requests()),
  'keys are opaque hashes');
select is(
  (select update_key from my_client_requests() where kind = 'approve'),
  pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest'),
  'a decision carries the key of the update decided on (the portal clears "needs you" with it)');
select is_empty($$ select 1 from client_requests_for_client('00000000-0000-4000-8000-00000000c001') $$,
  'the staff twin gives a client nothing');
select throws_ok($$ select * from client_requests_rows('00000000-0000-4000-8000-00000000c002', null) $$, '42501', null,
  'and it can''t call the internal query');
select throws_ok($$ select mark_client_request_seen(id) from (select gen_random_uuid() id) x $$, '42501', null,
  'a client can''t mark requests seen');
select throws_ok($$ select reply_to_client_request(gen_random_uuid(), 'x') $$, '42501', null, 'or reply');
select throws_ok($$ select withdraw_client_request_reply(gen_random_uuid()) $$, '42501', null, 'or withdraw a reply');
reset role;

select is(
  (select decision_snapshot - 'publishedAt' from client_requests where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'approve'),
  '{"route": null, "headline": "One latest", "projectKind": "three_pl", "recommendation": {"name": "Harborline"}}'::jsonb,
  'the approval stores a frozen copy of the recommendation it approved');
select is(
  (select array[created_by::text, status, (created_at = now())::text, client_id::text] from client_requests where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'approve'),
  array['00000000-0000-4000-8000-0000000000c1', 'sent', 'true', '00000000-0000-4000-8000-00000000c001'],
  'the client, the author, the time and the status are set by the database');

-- ---- A coworker sees the same; another client sees nothing ----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select set_eq(
  $$ select kind, from_first_name, from_me from my_client_requests() $$,
  $$ values ('question'::text, 'Maya'::text, false), ('approve', 'Maya', false) $$,
  'a coworker at the same client sees the same requests, marked as Maya''s');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is_empty($$ select 1 from my_client_requests() $$, 'another client sees none of them');
select is_empty($$ select 1 from client_requests $$, 'nor through the table');
reset role;

-- ---- must_change_password, forged, anon ------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-000000000303'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c003', 'Three latest')),
  'CQ403', null, 'a client that must still change its password can''t approve');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-000000000303')),
  'CQ403', null, 'or ask a question');
reset role;

select pg_temp.act_as_forged('00000000-0000-4000-8000-0000000000f2');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  'CQ403', null, 'a forged client_id can''t submit');
select is_empty($$ select 1 from my_client_requests() $$, 'or read requests');
select is_empty($$ select 1 from client_requests_for_client('00000000-0000-4000-8000-00000000c001') $$, 'even through the staff twin');
reset role;

set local role anon;
select throws_ok($$ select * from submit_client_request('question', 'x', null, 'x', false) $$, '42501', null, 'anon can''t submit');
select throws_ok($$ select * from my_client_requests() $$, '42501', null, 'or read');
select throws_ok($$ select * from client_requests_for_client(null) $$, '42501', null, 'or use the staff twin');
select throws_ok($$ select mark_client_request_seen(null) $$, '42501', null, 'or mark seen');
select throws_ok($$ select reply_to_client_request(null, 'x') $$, '42501', null, 'or reply');
select throws_ok($$ select withdraw_client_request_reply(null) $$, '42501', null, 'or withdraw');
select throws_ok($$ select my_client_request_badge() $$, '42501', null, 'or count');
select throws_ok($$ select * from client_requests $$, '42501', null, 'or read the table');
reset role;

-- ---- Staff: seen, reply (owner or admin), badge ----------------------------------------------
create temp table q as select id from public.client_requests where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'question';
grant select on q to authenticated;
create temp table client_one_rows as
  select request_key, kind, message, status, false as from_me
  from public.client_requests_rows('00000000-0000-4000-8000-00000000c001', null);
grant select on client_one_rows to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select is(my_client_request_badge(), 0, 'the badge counts only the caller''s own projects');
select is((select mark_client_request_seen(id) from pg_temp.q), false, 'an expert who doesn''t own the project can''t mark it seen');
select is((select status from client_requests where id = (select id from pg_temp.q)), 'sent', 'so it stays sent');
select throws_ok($$ select reply_to_client_request((select id from pg_temp.q), 'Yes') $$, '42501', null,
  'and can''t reply');
select set_eq(
  $$ select request_key, kind, message, status, from_me from client_requests_for_client('00000000-0000-4000-8000-00000000c001') $$,
  $$ select * from pg_temp.client_one_rows $$,
  'View as client gets the client''s rows, nothing marked as the viewer''s');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(my_client_request_badge(), 2, 'the owner''s badge counts both unseen requests');
select is((select mark_client_request_seen(id) from pg_temp.q), true, 'the owner opening it marks it seen');
select is(
  (select array[status, seen_by::text] from client_requests where id = (select id from pg_temp.q)),
  array['seen', '00000000-0000-4000-8000-0000000000a1'], 'seen, by the owner');
select is(my_client_request_badge(), 1, 'and the badge goes down');
select throws_ok($$ select reply_to_client_request((select id from pg_temp.q), '   ') $$, 'CQ422', null, 'an empty reply is refused');
select lives_ok($$ select reply_to_client_request((select id from pg_temp.q), 'Yes for Pacific Bridge (+$150). WITHDRAWN-CANARY') $$,
  'the owner replies');
select throws_ok($$ select reply_to_client_request((select id from pg_temp.q), 'Changed my mind') $$, 'CQ409', null,
  'a reply can''t be replaced');
select throws_ok($$ select withdraw_client_request_reply((select id from pg_temp.q)) $$, '42501', null,
  'only an admin can withdraw a reply');
reset role;

select throws_ok($$ update client_requests set staff_reply = 'edited' where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'question' $$, 'P0001', null,
  'a reply can''t be edited even by the table owner');
select throws_ok($$ update client_requests set message = 'edited' where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'approve' $$, 'P0001', null,
  'what a client sent can''t change');
select throws_ok($$ update client_requests set decision_snapshot = '{}' where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'approve' $$, 'P0001', null,
  'an approval''s frozen copy can''t change');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select results_eq(
  $$ select status, reply, replier_first_name, reply_withdrawn from my_client_requests() where kind = 'question' $$,
  $$ values ('answered'::text, 'Yes for Pacific Bridge (+$150). WITHDRAWN-CANARY'::text, 'Beah'::text, false) $$,
  'the client sees the reply and the replier''s first name');
reset role;

-- ---- An admin withdraws the reply --------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select lives_ok($$ select withdraw_client_request_reply((select id from pg_temp.q)) $$, 'an admin withdraws the reply');
select throws_ok($$ select withdraw_client_request_reply((select id from pg_temp.q)) $$, 'CQ409', null,
  'there''s nothing left to withdraw');
select is(
  (select array[status, coalesce(staff_reply, 'none'), reply_history -> 0 ->> 'reply', reply_history -> 0 ->> 'withdrawnBy',
                reply_history -> 0 ->> 'repliedBy']
   from client_requests where id = (select id from pg_temp.q)),
  array['seen', 'none', 'Yes for Pacific Bridge (+$150). WITHDRAWN-CANARY', '00000000-0000-4000-8000-0000000000ad',
        '00000000-0000-4000-8000-0000000000a1'],
  'back to seen; the withdrawn text and who wrote and withdrew it stay in the staff-only history');
select is(my_client_request_badge(), (select count(*)::int from client_requests where status = 'sent' and id <> (select id from pg_temp.q)),
  'an admin''s badge counts every unseen request, and withdrawing doesn''t make one unseen');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select status, reply, replier_first_name, reply_withdrawn from my_client_requests() where kind = 'question' $$,
  $$ values ('seen'::text, null::text, null::text, true) $$,
  'the client sees that a reply was withdrawn, not its text');
select is_empty($$ select 1 from my_client_requests() r where row_to_json(r)::text like '%WITHDRAWN-CANARY%' $$,
  'the withdrawn text is nowhere in what the client gets');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select is_empty(
  $$ select 1 from client_requests_for_client('00000000-0000-4000-8000-00000000c001') r where row_to_json(r)::text like '%WITHDRAWN-CANARY%' $$,
  'nor in View as client');
reset role;
select throws_ok($$ update client_requests set reply_history = '[]' where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'question' $$, 'P0001', null,
  'the withdrawn history can''t be rewritten');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$ select reply_to_client_request((select id from pg_temp.q), 'Yes, weekend delivery to Ontario is +$150.') $$,
  'the owner can reply again');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select status, reply, reply_withdrawn from my_client_requests() where kind = 'question' $$,
  $$ values ('answered'::text, 'Yes, weekend delivery to Ontario is +$150.'::text, false) $$,
  'and the client sees the new reply');
reset role;

-- ---- A new update makes the old one stale; a removed update leaves the request ------------------
select set_config('request.jwt.claims', '', true);
insert into client_updates (three_pl_project_id, stage, headline, summary, payload, is_draft, published_at)
values ('00000000-0000-4000-8000-000000000301', 5, 'One newest', 'x', '{"v":1,"kind":"three_pl","recommendation":{"name":"Keystone"}}', false, now());
select pg_temp.refresh_ukeys();
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One latest')),
  'CQ409', null, 'after a new update, approving the previous one is stale');
select isnt_empty(
  format($$ select * from submit_client_request('request_changes', %L, %L, 'We need a West Coast option', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One newest')),
  'a coworker can decide on the new one (request changes with a reason)');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c001', 'One newest')),
  'CQ409', null, 'and then nobody at the client can approve it too');
select throws_ok(
  format($$ select * from submit_client_request('request_changes', %L, %L, '  ', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000302'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c002', 'Two latest')),
  'CQ403', null, 'deciding on another client''s update is refused before anything else');
reset role;

select pg_temp.as_postgres();
delete from client_updates where headline = 'One latest';
select is(
  (select decision_snapshot -> 'recommendation' ->> 'name' from client_requests where client_id = '00000000-0000-4000-8000-00000000c001' and kind = 'approve'),
  'Harborline', 'removing the approved update keeps the approval and its frozen copy');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select update_key is null, decision_name from my_client_requests() where kind = 'approve' $$,
  $$ values (true, 'Harborline'::text) $$, 'the client still sees what it approved');
reset role;

-- ---- Rate caps ---------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select lives_ok(
  format($$ select f.* from generate_series(1, 10) n, lateral submit_client_request('question', %L, null, 'Question ' || n, false) f $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000302')),
  'ten questions in an hour are fine');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'One more', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000302')),
  'CQ429', null, 'the eleventh in an hour is refused');
select throws_ok(
  format($$ select * from submit_client_request('approve', %L, %L, null, false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000302'),
         pg_temp.ukey('00000000-0000-4000-8000-00000000c002', 'Two latest')),
  'CQ429', null, 'including a decision');
reset role;

-- 40 a day per client: written earlier today (as the seed would) by a coworker.
select pg_temp.as_postgres();
insert into client_requests (three_pl_project_id, kind, message, created_by, created_at)
select '00000000-0000-4000-8000-000000000301', 'question', 'Earlier ' || n, '00000000-0000-4000-8000-0000000000c1', now() - interval '3 hours'
from generate_series(1, 38) n;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok(
  format($$ select * from submit_client_request('question', %L, null, 'x', false) $$,
         pg_temp.ekey('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401')),
  'CQ429', null, 'the 41st request of the day from one client is refused, whoever sends it');
reset role;

select * from finish();
rollback;
