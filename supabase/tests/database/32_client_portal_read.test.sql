-- Client portal reads (Phase 2b). Clients read published updates only through
-- functions; client_updates stays staff-only. A client gets its own client's
-- published updates (never drafts, never another client's, no ids), can't
-- name another client anywhere, and a forged user_metadata client_id gets
-- nothing. Staff get the same rows for any client ("View as client"). Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- A token that claims to be a client of c001 everywhere it can, for an
-- account whose real (server-written) app_metadata has no role.
create function pg_temp.act_as_forged(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated',
    'user_metadata', json_build_object('role', 'client', 'client_id', '00000000-0000-4000-8000-00000000c001'),
    'app_metadata', json_build_object('role', 'client', 'client_id', '00000000-0000-4000-8000-00000000c001'))::text, true);
  execute 'set local role authenticated';
end $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Portal One'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Portal Two'),
  ('00000000-0000-4000-8000-00000000c003', 'pgTAP Portal Empty');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'beah@test.local', '{"role":"logistics_expert","first_name":"Beah Santos"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'carlos@test.local', '{"role":"logistics_expert","first_name":"Carlos"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a3', 'former@test.local', '{"first_name":"Former Staff"}', '{}'),
  ('00000000-0000-4000-8000-0000000000a4', 'noname@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'dana@test.local', '{"role":"admin","first_name":"Dana Admin-Lee"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'one-a@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'one-b@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c3', 'two@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c4', 'empty@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c003"}', '{}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 'forged@test.local', '{}',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}');

insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c002');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000ad', '00000000-0000-4000-8000-00000000c001');

-- Written as the local seed would (no signed-in user).
select set_config('request.jwt.claims', '', true);
insert into client_updates (three_pl_project_id, forwarder_project_id, stage, headline, summary, payload, is_draft, published_at) values
  ('00000000-0000-4000-8000-000000000301', null, 3, 'One: 3PL older', 'x', '{"v":1,"kind":"three_pl"}', false, '2026-09-01'),
  ('00000000-0000-4000-8000-000000000301', null, 4, 'One: 3PL latest', 'x', '{"v":1,"kind":"three_pl"}', false, '2026-10-01'),
  ('00000000-0000-4000-8000-000000000301', null, 5, 'DRAFT-CANARY one', 'x', '{"v":1,"kind":"three_pl"}', true, null),
  (null, '00000000-0000-4000-8000-000000000401', 2, 'One: forwarder', 'x', '{"v":1,"kind":"forwarder"}', false, '2026-09-15'),
  ('00000000-0000-4000-8000-000000000304', null, 6, 'Two: 3PL', 'x', '{"v":1,"kind":"three_pl"}', false, '2026-09-20');

-- ---- Structure and grants ------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p where p.oid in ('public.portal_updates_rows(uuid)'::regprocedure, 'public.my_portal_updates()'::regprocedure,
                                  'public.portal_updates_for_client(uuid)'::regprocedure, 'public.my_move_contact_names()'::regprocedure)),
  array['my_move_contact_names:true:search_path=""', 'my_portal_updates:true:search_path=""',
        'portal_updates_for_client:true:search_path=""', 'portal_updates_rows:true:search_path=""'],
  'all four are security definer with an empty search_path');
select ok(
  not has_function_privilege('anon', 'public.portal_updates_rows(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_portal_updates()', 'execute')
    and not has_function_privilege('anon', 'public.portal_updates_for_client(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_move_contact_names()', 'execute'),
  'anon can call none of them');
select ok(
  not has_function_privilege('authenticated', 'public.portal_updates_rows(uuid)', 'execute'),
  'signed-in users can''t call the internal query');
select ok(
  has_function_privilege('authenticated', 'public.my_portal_updates()', 'execute')
    and has_function_privilege('authenticated', 'public.portal_updates_for_client(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.my_move_contact_names()', 'execute'),
  'signed-in users can call the three wrappers (each checks the caller)');
select is(
  pg_get_function_result('public.my_portal_updates()'::regprocedure),
  'TABLE(engagement_key text, project_kind text, stage smallint, headline text, summary text, next_step text, next_step_due date, needs_client_action boolean, published_at timestamp with time zone, payload jsonb)',
  'a client gets exactly these columns: no update, project, client or staff ids');
select is(
  pg_get_function_result('public.my_move_contact_names()'::regprocedure),
  'TABLE(first_name text)', 'contact names are first names only');
-- Tripwire: every security-definer function a signed-in user can call,
-- other than triggers. A new one must be added here on purpose.
select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')),
  array['complete_password_change()', 'has_staff_role()', 'is_admin()', 'is_client_user()', 'is_tariff_editor()',
        'my_client_id()', 'my_move_contact_names()', 'my_portal_updates()', 'portal_updates_for_client(uuid)',
        'search_hts_lines(text[],text,integer)'],
  'the security-definer functions a signed-in user can call are exactly these');

-- ---- A client: its own published updates only --------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select headline from my_portal_updates() $$,
  $$ values ('One: 3PL latest'), ('One: forwarder'), ('One: 3PL older') $$,
  'a client reads its own client''s published updates, newest first');
select is_empty($$ select 1 from my_portal_updates() where headline like 'DRAFT-CANARY%' $$, 'never a draft');
select is_empty($$ select 1 from my_portal_updates() where headline like 'Two:%' $$, 'never another client''s');
select results_eq(
  $$ select project_kind, count(distinct engagement_key)::int from my_portal_updates() group by 1 order by 1 $$,
  $$ values ('forwarder', 1), ('three_pl', 1) $$,
  'one engagement key per project');
select ok(
  (select bool_and(engagement_key ~ '^[0-9a-f]{32}$') from my_portal_updates()), 'keys are opaque hashes');
select is_empty(
  $$ select 1 from my_portal_updates()
     where engagement_key in (md5('00000000-0000-4000-8000-000000000301'), md5('00000000-0000-4000-8000-000000000401'))
        or engagement_key like '%00000000%' $$,
  'and aren''t the project id or its plain hash');
select is_empty($$ select 1 from portal_updates_for_client('00000000-0000-4000-8000-00000000c002') $$,
  'the staff function gives a client nothing for another client');
select is_empty($$ select 1 from portal_updates_for_client('00000000-0000-4000-8000-00000000c001') $$,
  'nor for its own');
select throws_ok($$ select * from portal_updates_rows('00000000-0000-4000-8000-00000000c002') $$, '42501', null,
  'and it can''t call the internal query with another client''s id');
select is_empty($$ select 1 from client_updates $$, 'the table itself still gives a client nothing');
select results_eq($$ select first_name from my_move_contact_names() $$, $$ values ('Beah'), ('Dana') $$,
  'contact names: first word of each staff owner''s name (admins too), nothing else');
reset role;

create temp table client_one_rows as
  select engagement_key, headline from public.portal_updates_rows('00000000-0000-4000-8000-00000000c001');
grant select on client_one_rows to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select set_eq($$ select engagement_key, headline from my_portal_updates() $$, $$ select * from pg_temp.client_one_rows $$,
  'a coworker at the same client sees exactly the same');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select results_eq($$ select headline from my_portal_updates() $$, $$ values ('Two: 3PL') $$, 'the other client sees only its own');
select is_empty(
  $$ select 1 from my_portal_updates() u join pg_temp.client_one_rows o using (engagement_key) $$,
  'with keys unrelated to the first client''s');
select results_eq($$ select first_name from my_move_contact_names() $$, $$ values ('Carlos') $$, 'and only its own contacts');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select is_empty($$ select 1 from my_portal_updates() $$, 'a client with nothing published gets no rows');
select is_empty($$ select 1 from my_move_contact_names() $$, 'and no names when it has no projects');
reset role;

-- ---- Staff: View as client ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select set_eq(
  $$ select engagement_key, headline from portal_updates_for_client('00000000-0000-4000-8000-00000000c001') $$,
  $$ select * from pg_temp.client_one_rows $$,
  'staff get exactly what the client sees, for any client');
select is_empty($$ select 1 from portal_updates_for_client(null) $$, 'nothing for no client');
select is_empty($$ select 1 from my_portal_updates() $$, 'staff have no client of their own');
select is_empty($$ select 1 from my_move_contact_names() $$, 'nor contacts');
select throws_ok($$ select * from portal_updates_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'staff can''t call the internal query either');
reset role;

-- ---- No role, a forged client_id, anon -------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is_empty($$ select 1 from my_portal_updates() $$, 'an account without a role reads nothing');
select is_empty($$ select 1 from portal_updates_for_client('00000000-0000-4000-8000-00000000c001') $$, 'through either function');
select is_empty($$ select 1 from my_move_contact_names() $$, 'and gets no names');
reset role;

select pg_temp.act_as_forged('00000000-0000-4000-8000-0000000000f2');
select is(public.my_client_id(), null::uuid, 'a client_id in user_metadata (and claimed in the token) isn''t a client id');
select is_empty($$ select 1 from my_portal_updates() $$, 'a forged client gets no updates');
select is_empty($$ select 1 from portal_updates_for_client('00000000-0000-4000-8000-00000000c001') $$, 'nor through the staff function');
select is_empty($$ select 1 from my_move_contact_names() $$, 'nor names');
select is_empty($$ select 1 from client_updates $$, 'nor rows from the table');
select throws_ok($$ select * from portal_updates_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'nor the internal query');
reset role;

set local role anon;
select throws_ok($$ select * from my_portal_updates() $$, '42501', null, 'anon can''t call my_portal_updates');
select throws_ok($$ select * from portal_updates_for_client('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'or portal_updates_for_client');
select throws_ok($$ select * from my_move_contact_names() $$, '42501', null, 'or my_move_contact_names');
select throws_ok($$ select * from portal_updates_rows('00000000-0000-4000-8000-00000000c001') $$, '42501', null,
  'or the internal query');
reset role;

-- ---- A demoted owner drops out; a client user is never a contact -----------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is_empty($$ select 1 from my_move_contact_names() where first_name in ('Former', 'Staff', '') $$,
  'an owner who no longer has a staff role isn''t named');
select is_empty($$ select 1 from my_move_contact_names() where first_name ~ '@|Santos|Admin-Lee' $$,
  'no emails or last names');
reset role;

-- ---- Publishing and removing show up straight away ----------------------------------------------
delete from client_updates where headline = 'One: forwarder';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq($$ select headline from my_portal_updates() $$, $$ values ('One: 3PL latest'), ('One: 3PL older') $$,
  'a removed update disappears for the client');
reset role;

select * from finish();
rollback;
