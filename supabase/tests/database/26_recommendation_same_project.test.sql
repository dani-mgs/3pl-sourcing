-- A recommendation names only 3PLs from its own project (QA regression
-- 2026-10-09, B-5): each provider slot's foreign key includes the project.
-- Deleting a 3PL still empties only its slot. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', 'logistics_expert'))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP 26 Client');
insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into three_pl_providers (id, three_pl_project_id, company_name) values
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-000000000301', 'A1'),
  ('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-000000000301', 'A2'),
  ('00000000-0000-4000-8000-0000000003a3', '00000000-0000-4000-8000-000000000301', 'A3'),
  ('00000000-0000-4000-8000-0000000003a4', '00000000-0000-4000-8000-000000000301', 'A4'),
  ('00000000-0000-4000-8000-0000000003b1', '00000000-0000-4000-8000-000000000302', 'B1'),
  ('00000000-0000-4000-8000-0000000003f1', '00000000-0000-4000-8000-000000000303', 'F1');

-- ---- The constraints -------------------------------------------------------------
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.three_pl_providers'::regclass and conname = 'three_pl_providers_project_id_id_key'),
  'UNIQUE (three_pl_project_id, id)',
  'three_pl_providers has a unique (three_pl_project_id, id), the target of the slot keys (and a project index)');
select is(
  (select array_agg(conname || ': ' || pg_get_constraintdef(oid) order by conname) from pg_constraint
   where conrelid = 'public.recommendation'::regclass and conname like 'recommendations_provider_id_%'),
  array[
    'recommendations_provider_id_1_fkey: FOREIGN KEY (three_pl_project_id, provider_id_1) REFERENCES three_pl_providers(three_pl_project_id, id) ON DELETE SET NULL (provider_id_1)',
    'recommendations_provider_id_2_fkey: FOREIGN KEY (three_pl_project_id, provider_id_2) REFERENCES three_pl_providers(three_pl_project_id, id) ON DELETE SET NULL (provider_id_2)',
    'recommendations_provider_id_3_fkey: FOREIGN KEY (three_pl_project_id, provider_id_3) REFERENCES three_pl_providers(three_pl_project_id, id) ON DELETE SET NULL (provider_id_3)'],
  'each slot''s key includes the project, keeps its name, and empties only its own slot on delete');

-- ---- Same project: saved ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ insert into recommendation (three_pl_project_id, priority, provider_id_1, provider_id_2, provider_id_3) values
     ('00000000-0000-4000-8000-000000000301', 'Cost Savings',
      '00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000003a3') $$,
  'three 3PLs from the project save');
select lives_ok(
  $$ update recommendation set provider_id_2 = '00000000-0000-4000-8000-0000000003a4', provider_id_3 = null
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  'so do another of its 3PLs and an empty slot');
update recommendation set provider_id_2 = '00000000-0000-4000-8000-0000000003a2', provider_id_3 = '00000000-0000-4000-8000-0000000003a3'
  where three_pl_project_id = '00000000-0000-4000-8000-000000000301';

-- ---- Another project's 3PL: refused (B-5 repro) -----------------------------------------
select throws_ok(
  $$ update recommendation set provider_id_1 = '00000000-0000-4000-8000-0000000003b1'
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  '23503', null, 'another project''s 3PL is refused in slot 1');
select throws_ok(
  $$ update recommendation set provider_id_2 = '00000000-0000-4000-8000-0000000003b1'
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  '23503', null, 'in slot 2');
select throws_ok(
  $$ update recommendation set provider_id_3 = '00000000-0000-4000-8000-0000000003b1'
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  '23503', null, 'and in slot 3');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select throws_ok(
  $$ insert into recommendation (three_pl_project_id, priority, provider_id_1) values
     ('00000000-0000-4000-8000-000000000302', 'Cost Savings', '00000000-0000-4000-8000-0000000003a1') $$,
  '23503', null, 'and on insert');
reset role;
select is((select count(*)::int from recommendation where three_pl_project_id = '00000000-0000-4000-8000-000000000302'), 0,
  'the refused insert saved nothing');

-- Not even the database owner can bypass it, from either side.
select throws_ok(
  $$ update recommendation set three_pl_project_id = '00000000-0000-4000-8000-000000000302'
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  '23503', null, 'a recommendation can''t be moved to a project its 3PLs aren''t in');
select throws_ok(
  $$ update three_pl_providers set three_pl_project_id = '00000000-0000-4000-8000-000000000302'
     where id = '00000000-0000-4000-8000-0000000003a1' $$,
  '23503', null, 'a 3PL named in a recommendation can''t be moved to another project');

-- ---- Deleting a 3PL or a project -----------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select isnt_empty(
  $$ delete from three_pl_providers where id = '00000000-0000-4000-8000-0000000003a2' returning id $$,
  'a 3PL in the top three can still be deleted');
reset role;
select results_eq(
  $$ select three_pl_project_id, provider_id_1, provider_id_2, provider_id_3 from recommendation
     where three_pl_project_id = '00000000-0000-4000-8000-000000000301' $$,
  $$ values ('00000000-0000-4000-8000-000000000301'::uuid, '00000000-0000-4000-8000-0000000003a1'::uuid,
             null::uuid, '00000000-0000-4000-8000-0000000003a3'::uuid) $$,
  'which empties only its slot, keeping the project and the other two');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into recommendation (three_pl_project_id, priority) values ('00000000-0000-4000-8000-000000000304', 'Turnaround Time');
select isnt_empty(
  $$ delete from three_pl_projects where id = '00000000-0000-4000-8000-000000000304' returning id $$,
  'a project without 3PLs can still be deleted');
reset role;
select is((select count(*)::int from recommendation where three_pl_project_id = '00000000-0000-4000-8000-000000000304'), 0,
  'and its recommendation goes with it');

-- ---- No role -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok(
  $$ insert into recommendation (three_pl_project_id, priority, provider_id_1) values
     ('00000000-0000-4000-8000-000000000303', 'Cost Savings', '00000000-0000-4000-8000-0000000003f1') $$,
  '42501', null, 'an account without a role can''t save a recommendation, even for its own project and 3PL');
reset role;
select is((select count(*)::int from recommendation where three_pl_project_id = '00000000-0000-4000-8000-000000000303'), 0,
  'and nothing was saved');

-- ---- The production pre-check ------------------------------------------------------------
-- The read-only query in the report (run before deploying, since ADD CONSTRAINT
-- fails on a bad row) finds a row from before the guard. One is made here with
-- foreign keys switched off for this transaction only.
set local session_replication_role = replica;
insert into recommendation (three_pl_project_id, priority, provider_id_2) values
  ('00000000-0000-4000-8000-000000000302', 'Cost Savings', '00000000-0000-4000-8000-0000000003a4');
set local session_replication_role = origin;
select results_eq(
  $$ select r.three_pl_project_id, s.slot, s.provider_id, p.three_pl_project_id as provider_project_id
     from public.recommendation r
     cross join lateral (values (1, r.provider_id_1), (2, r.provider_id_2), (3, r.provider_id_3)) s(slot, provider_id)
     join public.three_pl_providers p on p.id = s.provider_id
     where p.three_pl_project_id <> r.three_pl_project_id $$,
  $$ values ('00000000-0000-4000-8000-000000000302'::uuid, 2, '00000000-0000-4000-8000-0000000003a4'::uuid,
             '00000000-0000-4000-8000-000000000301'::uuid) $$,
  'the pre-check query finds a row that breaks the rule, and only that one');

select * from finish();
rollback;
