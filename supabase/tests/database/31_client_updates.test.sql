-- client_updates (Phase 2a): snapshots shared with a client. Staff-only in
-- this phase: the project owner or an admin writes, published rows are
-- immutable (an admin may delete one), the client and author can't be
-- chosen, and client users, accounts without a role and anon get nothing.
-- client_update_inputs is staff-only for good. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client One'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Client Two');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'client@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}');
insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');

-- ---- Structure --------------------------------------------------------------------
select has_table('public', 'client_updates', 'client_updates exists');
select has_table('public', 'client_update_inputs', 'client_update_inputs exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.client_updates'::regclass, 'public.client_update_inputs'::regclass)),
  'RLS is on for both');
select ok(
  not has_table_privilege('anon', 'public.client_updates', 'select,insert,update,delete')
    and not has_table_privilege('anon', 'public.client_update_inputs', 'select,insert,update,delete'),
  'anon has no privileges on either');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
     and tablename in ('client_updates', 'client_update_inputs')
     and permissive = 'RESTRICTIVE' and cmd = 'ALL'
     and qual = '( SELECT has_staff_role() AS has_staff_role)'
     and with_check = '( SELECT has_staff_role() AS has_staff_role)'),
  2, 'both have the restrictive staff policy (staff-only in Phase 2a)');

-- ---- Owner writes a draft ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ insert into client_updates (id, client_id, three_pl_project_id, stage, headline, summary, payload, created_by, published_at)
     values ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c002',
             '00000000-0000-4000-8000-000000000301', 3, 'Collecting quotes', 'Where we are.',
             '{"v":1,"kind":"three_pl"}', '00000000-0000-4000-8000-0000000000a2', null) $$,
  'the owner saves a draft');
reset role;
select results_eq(
  $$ select client_id, created_by, is_draft, published_at, published_by from client_updates
     where id = '00000000-0000-4000-8000-00000000d001' $$,
  $$ values ('00000000-0000-4000-8000-00000000c001'::uuid, '00000000-0000-4000-8000-0000000000a1'::uuid,
             true, null::timestamptz, null::uuid) $$,
  'the client is the project''s and the author is the caller, whatever was sent');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000301', 3, 'Again', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23505', null, 'one draft per project');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, forwarder_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302',
             '00000000-0000-4000-8000-000000000402', 3, 'Both', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23514', null, 'not two projects');
select throws_ok(
  $$ insert into client_updates (client_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', 3, 'None', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '42501', null, 'not zero projects (no project to own)');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 8, 'Stage 8', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23514', null, 'stage is 1 to 7');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 0, 'Stage 0', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23514', null, 'not 0');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, '  ', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23514', null, 'a headline is required');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, 'Notes', 'x',
             '{"v":1,"kind":"three_pl","notes":"INTERNAL-CANARY"}') $$,
  '23514', null, 'a payload key outside the allow-list is refused');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, 'Kind', 'x', '{"v":1,"kind":"forwarder"}') $$,
  '23514', null, 'the payload kind must match the project');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, 'Version', 'x', '{"v":2,"kind":"three_pl"}') $$,
  '23514', null, 'and its version must be known');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, 'Array', 'x', '[1]') $$,
  '23514', null, 'and it must be an object');
select lives_ok(
  $$ insert into client_update_inputs (client_update_id, inputs) values ('00000000-0000-4000-8000-00000000d001', '{"partnerIds":[]}') $$,
  'the owner stores the draft''s form inputs');
reset role;

-- ---- Another expert: reads, can't write --------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select isnt_empty($$ select 1 from client_updates $$, 'another expert reads updates (staff read everything)');
select throws_ok(
  $$ insert into client_updates (client_id, forwarder_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000401', 3, 'Not mine', 'x', '{"v":1,"kind":"forwarder"}') $$,
  '42501', null, 'but can''t add one to a project they don''t own');
select is_empty($$ update client_updates set headline = 'Hijack' returning id $$, 'nor edit a draft');
select is_empty($$ delete from client_updates returning id $$, 'nor remove one');
select is_empty($$ update client_update_inputs set inputs = '{}' returning client_update_id $$, 'nor change its inputs');
reset role;

-- ---- Publish ----------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select isnt_empty(
  $$ update client_updates set is_draft = false, published_by = '00000000-0000-4000-8000-0000000000a2',
       published_at = '2000-01-01' where id = '00000000-0000-4000-8000-00000000d001' returning id $$,
  'the owner publishes the draft');
reset role;
select ok(
  (select published_by = '00000000-0000-4000-8000-0000000000a1' and published_at > '2001-01-01'
   from client_updates where id = '00000000-0000-4000-8000-00000000d001'),
  'published_by is the caller and published_at is now, whatever was sent');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is_empty(
  $$ update client_updates set headline = 'Edited' where id = '00000000-0000-4000-8000-00000000d001' returning id $$,
  'a published update can''t be edited');
select is_empty(
  $$ update client_updates set is_draft = true where id = '00000000-0000-4000-8000-00000000d001' returning id $$,
  'nor turned back into a draft');
select throws_ok(
  $$ insert into client_update_inputs (client_update_id, inputs) values ('00000000-0000-4000-8000-00000000d001', '{}')
     on conflict (client_update_id) do update set inputs = excluded.inputs $$,
  '42501', null, 'nor its inputs changed');
select is_empty(
  $$ delete from client_updates where id = '00000000-0000-4000-8000-00000000d001' returning id $$,
  'the owner can''t delete a published update');
select lives_ok(
  $$ insert into client_updates (id, client_id, three_pl_project_id, stage, headline, summary, payload, is_draft)
     values ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001',
             '00000000-0000-4000-8000-000000000301', 4, 'Comparing', 'x', '{"v":1,"kind":"three_pl"}', false) $$,
  'publishing straight away (no draft) works too');
select lives_ok(
  $$ insert into client_updates (id, client_id, forwarder_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c001',
             '00000000-0000-4000-8000-000000000401', 2, 'Draft', 'x', '{"v":1,"kind":"forwarder"}') $$,
  'a forwarder draft');
select isnt_empty(
  $$ delete from client_updates where id = '00000000-0000-4000-8000-00000000d003' returning id $$,
  'the owner can delete their own draft');
reset role;

reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ update client_updates set headline = 'Edited' where id = '00000000-0000-4000-8000-00000000d001' $$,
  'P0001', 'Published updates can''t be changed. Publish a new update instead.',
  'even past RLS (the table owner), a published update can''t be edited');
select throws_ok(
  $$ update client_updates set is_draft = true where id = '00000000-0000-4000-8000-00000000d001' $$,
  'P0001', null, 'or turned back into a draft');
select throws_ok(
  $$ insert into client_updates (client_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', 3, 'None', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '23502', null, 'and an update without a project has no client, so it''s refused');

-- ---- Admin ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select lives_ok(
  $$ insert into client_updates (id, client_id, forwarder_project_id, stage, headline, summary, payload, is_draft)
     values ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c001',
             '00000000-0000-4000-8000-000000000401', 2, 'Admin', 'x', '{"v":1,"kind":"forwarder"}', false) $$,
  'an admin publishes on any project');
select isnt_empty(
  $$ delete from client_updates where id = '00000000-0000-4000-8000-00000000d002' returning id $$,
  'an admin can remove a published update (a mistake)');
reset role;

-- ---- Clients, accounts without a role, anon: nothing ----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is_empty($$ select 1 from client_updates $$, 'a client user reads none, not even its own client''s published update (Phase 2a)');
select is_empty($$ select 1 from client_update_inputs $$, 'nor any inputs');
select throws_ok(
  $$ insert into client_updates (client_id, three_pl_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000302', 3, 'Client', 'x', '{"v":1,"kind":"three_pl"}') $$,
  '42501', null, 'and can''t write one');
select is_empty($$ update client_updates set headline = 'x' returning id $$, 'or change one');
select is_empty($$ delete from client_updates returning id $$, 'or remove one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is_empty($$ select 1 from client_updates $$, 'an account without a role reads none');
reset role;
set local role anon;
select throws_ok($$ select 1 from client_updates $$, '42501', null, 'anon can''t read updates');
select throws_ok($$ select 1 from client_update_inputs $$, '42501', null, 'or inputs');
reset role;

-- ---- The project's client is fixed once something is published -----------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ update forwarder_projects set client_id = '00000000-0000-4000-8000-00000000c002'
     where id = '00000000-0000-4000-8000-000000000401' $$,
  'P0001', 'Updates for this project have been shared with its client, so its client can''t be changed. If it''s linked to the wrong client, ask an admin to remove the shared updates first.',
  'a forwarder project with a published update keeps its client');
select throws_ok(
  $$ update three_pl_projects set client_id = '00000000-0000-4000-8000-00000000c002'
     where id = '00000000-0000-4000-8000-000000000301' $$,
  'P0001', null, 'so does a 3PL project');
select lives_ok(
  $$ update forwarder_projects set status = 'On Hold' where id = '00000000-0000-4000-8000-000000000401' $$,
  'other edits are fine');
select lives_ok(
  $$ insert into client_updates (id, client_id, forwarder_project_id, stage, headline, summary, payload)
     values ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000c001',
             '00000000-0000-4000-8000-000000000402', 1, 'Draft only', 'x', '{"v":1,"kind":"forwarder"}') $$,
  'a draft on the second forwarder project');
select lives_ok(
  $$ update forwarder_projects set client_id = '00000000-0000-4000-8000-00000000c002'
     where id = '00000000-0000-4000-8000-000000000402' $$,
  'with only a draft, the client can still change');
select isnt_empty(
  $$ update client_updates set is_draft = false where id = '00000000-0000-4000-8000-00000000d005' returning id $$,
  'and publishing that draft...');
reset role;
select is(
  (select client_id from client_updates where id = '00000000-0000-4000-8000-00000000d005'),
  '00000000-0000-4000-8000-00000000c002'::uuid,
  '...sends it to the project''s new client, not the one it was drafted for');
select ok(
  not has_function_privilege('authenticated', 'public.refuse_client_change_after_publish()', 'execute'),
  'the trigger function can''t be called directly');

-- ---- Seed path: no signed-in user may set past dates --------------------------------
select set_config('request.jwt.claims', '', true);
insert into client_updates (id, client_id, three_pl_project_id, stage, headline, summary, payload, is_draft, published_at)
values ('00000000-0000-4000-8000-00000000d006', '00000000-0000-4000-8000-00000000c001',
        '00000000-0000-4000-8000-000000000302', 2, 'Seeded', 'x', '{"v":1,"kind":"three_pl"}', false, '2026-01-05 10:00+00');
select is(
  (select published_at from client_updates where id = '00000000-0000-4000-8000-00000000d006'),
  '2026-01-05 10:00+00'::timestamptz, 'a write with no signed-in user (the local seed) keeps its date');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ insert into client_updates (id, client_id, three_pl_project_id, stage, headline, summary, payload, is_draft, published_at)
     values ('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000c001',
             '00000000-0000-4000-8000-000000000302', 2, 'Backdated', 'x', '{"v":1,"kind":"three_pl"}', false, '2026-01-05') $$,
  'a signed-in expert publishes with a made-up date...');
reset role;
select ok(
  (select published_at > '2026-02-01' from client_updates where id = '00000000-0000-4000-8000-00000000d007'),
  '...and gets now instead');

-- ---- Deleting a project removes its updates and their inputs --------------------------
delete from three_pl_projects where id = '00000000-0000-4000-8000-000000000301';
select is_empty(
  $$ select 1 from client_updates where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  'deleting a project removes its updates');
select is_empty(
  $$ select 1 from client_update_inputs where client_update_id = '00000000-0000-4000-8000-00000000d001' $$,
  'and their inputs');

select * from finish();
rollback;
