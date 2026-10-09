-- Role checks follow the current role in auth.users, not the caller's token
-- (QA regression 2026-10-09, B-1 and B-2). Each user signs in once: their JWT
-- claims are captured and reused unchanged while the role is changed the way
-- /admin does it (updateUserById writes raw_app_meta_data). A demoted user is
-- refused at once, a promoted one can write at once, and nobody can make
-- themselves an admin or editor. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Reuses a token: the claims are whatever the user had when they signed in.
create function pg_temp.act_as(uid uuid, meta jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', meta)::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'expert@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');

-- Owned by a1; nobody else in this test owns anything.
insert into three_pl_projects (id, owner_id, client_id, target_geography) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'original');
insert into forwarder_projects (id, owner_id, client_id, cargo_description) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'original');

-- ---- The functions ------------------------------------------------------------
select is(
  (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure),
  true, 'is_admin() is security definer');
select is(
  (select prosecdef from pg_proc where oid = 'public.is_tariff_editor()'::regprocedure),
  true, 'is_tariff_editor() is security definer');
select is(
  (select array_agg(provolatile::text || ':' || array_to_string(proconfig, ',')) from pg_proc
   where oid in ('public.is_admin()'::regprocedure, 'public.is_tariff_editor()'::regprocedure)),
  array['s:search_path=""', 's:search_path=""'], 'both are stable with an empty search_path');
select ok(
  not has_function_privilege('anon', 'public.is_admin()', 'execute')
    and not has_function_privilege('anon', 'public.is_tariff_editor()', 'execute'),
  'anon cannot run them');
select ok(
  has_function_privilege('authenticated', 'public.is_admin()', 'execute')
    and has_function_privilege('authenticated', 'public.is_tariff_editor()', 'execute'),
  'signed-in users can (policies run them as the user)');

-- ---- B-1: a revoked tariff editor is refused at once, old token or not --------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select is(is_tariff_editor(), true, 'an editor is an editor');
reset role;
update auth.users set raw_app_meta_data = raw_app_meta_data - 'tariff_editor'
  where id = '00000000-0000-4000-8000-0000000000e1';

select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select is(is_tariff_editor(), false, 'revoked: the old token no longer makes them an editor');
select is_empty(
  $$ update customs_fees set notes = 'stale token' where fee_code = 'mpf_formal' returning id $$,
  'revoked: the old token cannot change a fee (B-1 repro)');
select throws_ok(
  $$ insert into customs_fees (fee_code, label, rate_pct, effective_from, source_label, source_url)
     values ('hmf', 'x', 0.5, '2030-01-01', 'x', 'https://example.gov/') $$,
  '42501', null, 'revoked: the old token cannot add a fee');
reset role;

-- ---- B-1: a demoted admin is refused at once, old token or not ----------------
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"logistics_expert"}'
  where id = '00000000-0000-4000-8000-0000000000ad';

select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', '{"role":"admin"}');
select is(is_admin(), false, 'demoted: the old token no longer makes them an admin');
select is(is_tariff_editor(), false, 'demoted: nor a tariff editor');
select is_empty(
  $$ update forwarder_projects set cargo_description = 'stale token' where id = '00000000-0000-4000-8000-000000000401' returning id $$,
  'demoted: the old token cannot change someone else''s forwarder project (B-1 repro)');
select is_empty(
  $$ update three_pl_projects set target_geography = 'stale token' where id = '00000000-0000-4000-8000-000000000301' returning id $$,
  'demoted: nor someone else''s 3PL project');
select is_empty(
  $$ delete from forwarder_projects where id = '00000000-0000-4000-8000-000000000401' returning id $$,
  'demoted: nor delete it');
select is_empty(
  $$ update customs_fees set notes = 'stale token' where fee_code = 'mpf_formal' returning id $$,
  'demoted: nor change a fee');
reset role;
select is(
  (select cargo_description from forwarder_projects where id = '00000000-0000-4000-8000-000000000401'),
  'original', 'the forwarder project is unchanged');

-- ---- B-2: a promoted user can write at once, without signing in again ---------
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
  where id = '00000000-0000-4000-8000-0000000000b1';

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1', '{"role":"logistics_expert"}');
select is(is_admin(), true, 'promoted: an admin straight away, with the token from before');
select isnt_empty(
  $$ update forwarder_projects set cargo_description = 'by promoted admin' where id = '00000000-0000-4000-8000-000000000401' returning id $$,
  'promoted: can edit someone else''s forwarder project (B-2 repro)');
select isnt_empty(
  $$ update three_pl_projects set target_geography = 'by promoted admin' where id = '00000000-0000-4000-8000-000000000301' returning id $$,
  'promoted: and their 3PL project');
reset role;

-- Granted the editor permission (a1 is a plain expert).
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"tariff_editor":true}'
  where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select is(is_tariff_editor(), true, 'granted: an editor straight away, with the token from before');
select isnt_empty(
  $$ update customs_fees set notes = 'by granted editor' where fee_code = 'mpf_formal' returning id $$,
  'granted: can change a fee');
reset role;

-- ---- Nobody makes themselves an admin or editor -------------------------------
-- A token that claims more than auth.users says counts for nothing.
update auth.users set raw_app_meta_data = '{"role":"logistics_expert"}'
  where id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"admin","tariff_editor":true}');
select is(is_admin() or is_tariff_editor(), false, 'claims in the token are ignored');
reset role;

-- user_metadata is what auth.updateUser lets anyone write about themselves.
update auth.users set raw_user_meta_data = '{"role":"admin","tariff_editor":true}'
  where id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert"}');
select is(is_admin() or is_tariff_editor(), false, 'role or editor in user_metadata counts for nothing');
select throws_ok(
  $$ update profiles set role = 'admin', tariff_editor = true where id = '00000000-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'a user cannot promote themselves through profiles');
reset role;
-- (Inserting a profile is refused by RLS: pgTAP 05.)
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    and not has_column_privilege('authenticated', 'public.profiles', 'tariff_editor', 'update'),
  'signed-in users have no update privilege on profiles.role or profiles.tariff_editor');
select ok(
  not has_table_privilege('authenticated', 'auth.users', 'select')
    and not has_table_privilege('authenticated', 'auth.users', 'update'),
  'signed-in users cannot read or write auth.users');

-- A token for a user who no longer exists (or never did) is neither.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ff', '{"role":"admin","tariff_editor":true}');
select is(is_admin() or is_tariff_editor(), false, 'a token for no user is neither admin nor editor');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1', '{"role":"admin"}');
select is(is_admin(), false, 'a deleted admin''s old token is no longer an admin');
reset role;

select * from finish();
rollback;
