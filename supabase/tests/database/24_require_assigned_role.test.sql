-- Access needs a role an admin assigned (app_metadata.role is admin or
-- logistics_expert, read live from auth.users). A signed-in account without
-- one reads nothing and writes nothing on every RLS table; nobody signed in
-- can TRUNCATE; experts and admins are unaffected. The backfill of existing
-- users is checked by an upgrade run, since this suite starts with no users.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', 'logistics_expert'))::text, true);
  execute 'set local role authenticated';
end $$;

-- Every RLS table, as postgres sees it: how many rows a user can read.
create function pg_temp.visible_rows() returns table (tbl text, n bigint) language plpgsql as $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1 loop
    tbl := t;
    execute format('select count(*) from public.%I', t) into n;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.visible_rows() to authenticated;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}', '{}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}', '{}'),
  ('00000000-0000-4000-8000-0000000000f1', 'norole@test.local', '{"tariff_editor":true}', '{"role":"admin"}'),
  ('00000000-0000-4000-8000-0000000000f2', 'badrole@test.local', '{"role":"superuser"}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');
insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into three_pl_providers (three_pl_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000301', 'pgTAP 3PL');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'pgTAP Forwarder');
insert into forwarder_quotes (forwarder_id, notes) values ('00000000-0000-4000-8000-000000000402', 'q');
insert into fx_rates (rate_date, currency, rate_to_usd) values ('2026-10-01', 'EUR', 1.08);

-- ---- The helpers ----------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || p.provolatile::text || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p where p.oid in ('public.has_app_role()'::regprocedure, 'public.has_app_role_user(uuid)'::regprocedure)),
  array['has_app_role:true:s:search_path=""', 'has_app_role_user:true:s:search_path=""'],
  'both helpers are security definer, stable, with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.has_app_role()', 'execute')
    and not has_function_privilege('anon', 'public.has_app_role()', 'execute'),
  'has_app_role(): signed-in users can run it (policies do), anon cannot');
select ok(
  has_function_privilege('service_role', 'public.has_app_role_user(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.has_app_role_user(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.has_app_role_user(uuid)', 'execute'),
  'has_app_role_user(): service role only');
select is(
  (select count(*)::int from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                     and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
                     and p.qual = '( SELECT has_app_role() AS has_app_role)'
                     and p.with_check = '( SELECT has_app_role() AS has_app_role)')),
  0, 'every RLS table has the restrictive role policy, as a once-per-query subselect');
select is(
  (select count(*)::int from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  21, 'there are 21 RLS tables (a new one needs the policy too)');

select is(
  (select prosecdef from pg_proc where oid = 'public.search_hts_lines(text[], text, integer)'::regprocedure),
  true, 'search_hts_lines runs as owner (for the full-text index) and checks the role itself');

-- A current release with one line, to search for.
insert into hts_releases (id, name, status) values ('00000000-0000-4000-8000-00000000ba01', 'pgTAP', 'current');
insert into hts_lines (release_id, hts_code, chapter, indent, description) values
  ('00000000-0000-4000-8000-00000000ba01', '6402993110', '64', 2, 'Footwear, rubber soles');

-- ---- No role: nothing to read --------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is(has_app_role(), false, 'no role in app_metadata (only in user_metadata) is no role');
select is(
  (select coalesce(sum(n), 0)::int from pg_temp.visible_rows()), 0,
  'an account without a role reads 0 rows from all 21 RLS tables');
select is_empty($$ select * from fx_rates_latest $$, 'nor through the views');
select is_empty($$ select * from public.search_hts_lines(array['footwear'], null, 10) $$, 'nor through the HTS search');
select is_empty($$ select * from public.search_hts_lines(null, '6402', 10) $$, 'nor by HTS code');
select is(is_tariff_editor(), true, 'its editor flag is still set...');
select is_empty(
  $$ update customs_fees set notes = 'x' returning id $$,
  '...but without a role it can''t change fees');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
select is(has_app_role(), false, 'an unknown role ("superuser") is no role');
select is((select coalesce(sum(n), 0)::int from pg_temp.visible_rows()), 0, 'and reads 0 rows');

-- ---- No role: nothing to write ------------------------------------------------
select throws_ok(
  $$ insert into clients (name) values ('Sneaky Co') $$,
  '42501', null, 'an account without a role cannot add a client');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok(
  $$ insert into forwarder_projects (owner_id, client_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c001') $$,
  '42501', null, 'nor a project of its own');
reset role;

-- ---- TRUNCATE ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$ truncate public.forwarder_quotes $$, '42501', null, 'an account without a role cannot truncate');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select throws_ok($$ truncate public.clients cascade $$, '42501', null, 'nor can an admin');
reset role;
select is(
  (select array_agg(t order by t) from unnest(array['clients', 'forwarder_projects', 'forwarder_quotes', 'forwarders',
     'profiles', 'rate_details', 'recommendation', 'three_pl_projects', 'three_pl_providers']) t
   where has_table_privilege('authenticated', 'public.' || t, 'truncate') or has_table_privilege('anon', 'public.' || t, 'truncate')),
  null, 'no signed-in or anon TRUNCATE on the 9 tables');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('authenticated', 'anon')),
  0, 'nor on any other public table');
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert')
    and not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'profiles: the unused insert and delete grants are gone');

-- ---- Roles are unaffected ------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(has_app_role(), true, 'an expert has a role');
select is((select count(*)::int from public.search_hts_lines(array['footwear'], null, 10)), 1, 'an expert''s HTS search works');
select is(
  (select array_agg(tbl || '=' || n order by tbl) from pg_temp.visible_rows() where tbl in ('clients', 'forwarder_quotes', 'fx_rates', 'profiles', 'three_pl_providers')),
  array['clients=1', 'forwarder_quotes=1', 'fx_rates=1', 'profiles=5', 'three_pl_providers=1'],
  'an expert reads as before');
select isnt_empty(
  $$ update forwarder_projects set cargo_description = 'by owner' where id = '00000000-0000-4000-8000-000000000401' returning id $$,
  'an expert still edits their own project');
select lives_ok(
  $$ insert into clients (name) values ('Expert New Co') $$, 'and adds a client');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select isnt_empty(
  $$ update three_pl_projects set target_geography = 'by admin' where id = '00000000-0000-4000-8000-000000000301' returning id $$,
  'an admin still edits anyone''s project');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok(
  $$ update customs_fees set notes = notes where fee_code = 'mpf_formal' $$, 'a tariff editor still maintains fees');
reset role;

-- ---- The profile mirror and save_duty_estimate -----------------------------------
select is((select role from profiles where email = 'norole@test.local'), 'none',
  'a missing role shows as none in profiles, not logistics_expert');
-- A role granted later takes effect at once.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"logistics_expert"}' where email = 'norole@test.local';
select is((select role from profiles where email = 'norole@test.local'), 'logistics_expert', 'assigning a role updates the mirror');
update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where email = 'norole@test.local';

set local role service_role;
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000f1', '{"label":"x"}'::jsonb) $$,
  '42501', 'This account has no role yet.', 'save_duty_estimate refuses an account without a role');
reset role;

select * from finish();
rollback;
