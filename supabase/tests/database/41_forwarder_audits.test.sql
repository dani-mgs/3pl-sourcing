-- Forwarder Audit: any staff member reads; only an audit's owner or an admin
-- updates (inputs only) or deletes it; a client, a roleless account and anon
-- get nothing. Owner can't be changed, bad inputs are refused, and no
-- service_role privilege exists. Counts only its own rows. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000041a1', 'fa-owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000041a2', 'fa-other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000041ad', 'fa-admin@test.local', '{"role":"admin"}', '{}'),
  ('00000000-0000-4000-8000-0000000041f1', 'fa-norole@test.local', '{}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-0000000041c0', 'pgTAP FA Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000041c1', 'fa-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-0000000041c0"}', '{}');

insert into forwarder_audits (id, owner_id, inputs) values
  ('00000000-0000-4000-8000-000000410001', '00000000-0000-4000-8000-0000000041a1', '{"shipment":{}}'),
  ('00000000-0000-4000-8000-000000410002', '00000000-0000-4000-8000-0000000041a2', '{"shipment":{}}');

create function pg_temp.mine() returns int language sql as $$
  select count(*)::int from public.forwarder_audits where id::text like '00000000-0000-4000-8000-0000004100%';
$$;
grant execute on function pg_temp.mine() to authenticated;

-- Rows changed by a write (RLS filters silently, so a refusal is 0 rows).
create function pg_temp.changed(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function pg_temp.changed(text) to authenticated;

-- ---- Structure -----------------------------------------------------------------------
select is((select relrowsecurity from pg_class where oid = 'public.forwarder_audits'::regclass), true, 'RLS is on');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'forwarder_audits' and grantee in ('service_role', 'anon')),
  0, 'no service_role or anon privileges');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'forwarder_audits'
     and permissive = 'RESTRICTIVE' and cmd = 'ALL' and qual = '( SELECT has_staff_role() AS has_staff_role)'),
  1, 'the restrictive staff policy is there');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'forwarder_audit%'),
  0, 'no function of its own (so none that is security definer)');

-- ---- Reads ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000041a2');
select is(pg_temp.mine(), 2, 'another expert reads every audit');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000041f1');
select is(pg_temp.mine(), 0, 'an account without a staff role reads none');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000041c1');
select is(pg_temp.mine(), 0, 'a client reads none');
reset role;
set local role anon;
select throws_ok('select * from forwarder_audits', '42501', null, 'anon is refused');
reset role;

-- ---- The owner writes ----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000041a1');
select lives_ok(
  $$ insert into forwarder_audits (id, inputs) values ('00000000-0000-4000-8000-000000410003', '{"a":1}') $$,
  'the owner creates an audit');
select is((select owner_id from forwarder_audits where id = '00000000-0000-4000-8000-000000410003'),
  '00000000-0000-4000-8000-0000000041a1'::uuid, 'its owner defaults to the signed-in user');
select is((select template_version from forwarder_audits where id = '00000000-0000-4000-8000-000000410003'), '1.0', 'template version 1.0');
select throws_ok(
  $$ insert into forwarder_audits (id, owner_id, inputs) values ('00000000-0000-4000-8000-000000410004', '00000000-0000-4000-8000-0000000041a2', '{}') $$,
  '42501', null, 'nobody creates an audit for someone else');
select is(
  pg_temp.changed($q$ update forwarder_audits set inputs = '{"b":2}' where id = '00000000-0000-4000-8000-000000410001' $q$),
  1, 'the owner updates the inputs');
select throws_ok(
  $$ update forwarder_audits set owner_id = '00000000-0000-4000-8000-0000000041a2' where id = '00000000-0000-4000-8000-000000410001' $$,
  '42501', null, 'the owner can''t be changed');
select throws_ok(
  $$ update forwarder_audits set created_at = now() where id = '00000000-0000-4000-8000-000000410001' $$,
  '42501', null, 'neither can created_at');
select throws_ok(
  $$ insert into forwarder_audits (id, inputs) values ('00000000-0000-4000-8000-000000410005', '[1]') $$,
  '23514', null, 'inputs must be a JSON object');
select throws_ok(
  $$ insert into forwarder_audits (id, inputs) values ('00000000-0000-4000-8000-000000410006', jsonb_build_object('x', repeat('x', 200001))) $$,
  '23514', null, 'inputs have a size cap');
reset role;

-- ---- Others ----------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000041a2');
select is(
  pg_temp.changed($q$ update forwarder_audits set inputs = '{"c":3}' where id = '00000000-0000-4000-8000-000000410001' $q$),
  0, 'another expert can''t update it');
select is(
  pg_temp.changed($q$ delete from forwarder_audits where id = '00000000-0000-4000-8000-000000410001' $q$),
  0, 'nor delete it');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000041ad');
select is(
  pg_temp.changed($q$ update forwarder_audits set inputs = '{"d":4}' where id = '00000000-0000-4000-8000-000000410001' $q$),
  1, 'an admin updates anyone''s audit');
select is(
  pg_temp.changed($q$ delete from forwarder_audits where id = '00000000-0000-4000-8000-000000410002' $q$),
  1, 'and deletes it');
reset role;

select is(
  (select count(*)::int from pg_trigger where tgrelid = 'public.forwarder_audits'::regclass and tgname = 'forwarder_audits_set_updated_at'),
  1, 'updated_at is maintained by a trigger (the clock is frozen inside a test transaction)');

select * from finish();
rollback;
