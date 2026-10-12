-- client_entitlements: one row per client (no row = free). Staff read every
-- row, a client user reads only its own client's row, only admins write,
-- granted_by is always the signed-in admin, anon gets nothing. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Paid Co'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Free Co'),
  ('00000000-0000-4000-8000-00000000c003', 'pgTAP No Row Co');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'paid@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'free@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c002"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'norow@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c003"}');

-- ---- Structure --------------------------------------------------------------------
select has_table('public', 'client_entitlements', 'the table exists');
select col_is_unique('public', 'client_entitlements', 'client_id', 'one row per client');
select col_not_null('public', 'client_entitlements', 'tier', 'tier is required');
select is(
  (select relrowsecurity from pg_class where oid = 'public.client_entitlements'::regclass), true, 'RLS is on');
select ok(
  not has_table_privilege('anon', 'public.client_entitlements', 'select')
    and not has_table_privilege('anon', 'public.client_entitlements', 'insert')
    and not has_table_privilege('anon', 'public.client_entitlements', 'update')
    and not has_table_privilege('anon', 'public.client_entitlements', 'delete'),
  'anon has no privileges');
select ok(
  not has_table_privilege('authenticated', 'public.client_entitlements', 'truncate')
    and not has_table_privilege('anon', 'public.client_entitlements', 'truncate'),
  'nobody signed in can truncate it');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'client_entitlements'
     and permissive = 'RESTRICTIVE' and cmd = 'ALL'
     and with_check = '( SELECT has_staff_role() AS has_staff_role)'),
  1, 'its restrictive policy lets only staff write');

-- ---- Admin writes ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select lives_ok(
  $$ insert into client_entitlements (client_id, tier, granted_by) values
       ('00000000-0000-4000-8000-00000000c001', 'market_report', '00000000-0000-4000-8000-0000000000a1') $$,
  'an admin grants the paid tier');
select lives_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c002', 'free') $$,
  'and records a free tier');
reset role;
select is(
  (select granted_by from client_entitlements where client_id = '00000000-0000-4000-8000-00000000c001'),
  '00000000-0000-4000-8000-0000000000ad'::uuid, 'granted_by is the admin who did it, whatever was sent');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c001', 'free') $$,
  '23505', null, 'a second row for the same client is refused');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c003', 'platinum') $$,
  '23514', null, 'an unknown tier is refused');
select isnt_empty(
  $$ update client_entitlements set valid_until = now() + interval '1 year'
     where client_id = '00000000-0000-4000-8000-00000000c001' returning id $$,
  'an admin sets an end date');
reset role;

-- ---- Expert: reads all, writes nothing ------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from client_entitlements), 2, 'an expert reads every row');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c003', 'market_report') $$,
  '42501', null, 'an expert cannot grant a tier');
select is_empty(
  $$ update client_entitlements set tier = 'free' returning id $$, 'nor change one');
select is_empty($$ delete from client_entitlements returning id $$, 'nor remove one');
reset role;

-- ---- Clients: their own row only --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select results_eq(
  $$ select client_id, tier from client_entitlements $$,
  $$ values ('00000000-0000-4000-8000-00000000c001'::uuid, 'market_report'::text) $$,
  'the paid client reads exactly its own row');
select is_empty(
  $$ select 1 from client_entitlements where client_id = '00000000-0000-4000-8000-00000000c002' $$,
  'not another client''s, even by id');
select is_empty($$ update client_entitlements set valid_until = null returning id $$, 'it cannot change its row');
select is_empty($$ delete from client_entitlements returning id $$, 'nor remove it');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c003', 'market_report') $$,
  '42501', null, 'nor add one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select results_eq(
  $$ select tier from client_entitlements $$, $$ values ('free'::text) $$, 'the free client reads its free row');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is_empty($$ select 1 from client_entitlements $$, 'a client with no row reads nothing (free by default)');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c003', 'market_report') $$,
  '42501', null, 'and cannot grant itself the paid tier');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is_empty($$ select 1 from client_entitlements $$, 'an account without a role reads nothing');
reset role;

set local role anon;
select throws_ok($$ select 1 from client_entitlements $$, '42501', null, 'anon cannot read it');
reset role;

-- ---- Audit fields and cascade -------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select isnt_empty(
  $$ update client_entitlements set created_at = '2000-01-01', tier = 'market_report'
     where client_id = '00000000-0000-4000-8000-00000000c002' returning id $$,
  'an admin upgrades the free client');
reset role;
select ok(
  (select created_at > '2001-01-01' from client_entitlements where client_id = '00000000-0000-4000-8000-00000000c002'),
  'created_at can''t be rewritten');
select ok(
  (select updated_at >= created_at from client_entitlements where client_id = '00000000-0000-4000-8000-00000000c002'),
  'updated_at moves with the change');
delete from auth.users where id in ('00000000-0000-4000-8000-0000000000c2');
delete from clients where id = '00000000-0000-4000-8000-00000000c002';
select is_empty(
  $$ select 1 from client_entitlements where client_id = '00000000-0000-4000-8000-00000000c002' $$,
  'deleting a client removes its entitlement');

select * from finish();
rollback;
