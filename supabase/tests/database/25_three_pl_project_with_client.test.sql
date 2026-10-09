-- create_three_pl_project_with_client (QA regression 2026-10-09, B-9): a new
-- client and its 3PL project are created together or not at all, as the
-- caller (RLS applies), with owner, status and client set by the function.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'Acme Co');

-- ---- The function ---------------------------------------------------------------
select is(
  (select p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') from pg_proc p
   where p.oid = 'public.create_three_pl_project_with_client(text, text, jsonb)'::regprocedure),
  'false:search_path=""', 'security invoker (RLS applies), with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.create_three_pl_project_with_client(text, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.create_three_pl_project_with_client(text, text, jsonb)', 'execute'),
  'signed-in users can run it, anon cannot');

-- ---- Success: both, together ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
create temp table created as
  select public.create_three_pl_project_with_client(
    '  New Client Co  ', ' B2C ',
    '{"target_geography":"US West","contract_period_months":36,"avg_monthly_orders":1200,"important_limitation":null}'::jsonb
  ) as project_id;
reset role;
select results_eq(
  $$ select p.owner_id, p.status, c.name, c.business_model, p.target_geography, p.contract_period_months, p.avg_monthly_orders
     from three_pl_projects p join clients c on c.id = p.client_id
     where p.id = (select project_id from created) $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'Active'::text, 'New Client Co'::text, 'B2C'::text, 'US West'::text, 36::smallint, 1200) $$,
  'creates the client (trimmed) and the project, owned by the caller and Active');

-- ---- Atomicity: a project that fails leaves no client ----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('Orphan Test Co', null, '{"contract_period_months":0}'::jsonb) $$,
  '23514', null, 'a project that breaks a check constraint is refused');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('Orphan Test Co', null, '{"avg_monthly_orders":"lots"}'::jsonb) $$,
  '22P02', null, 'so is a value of the wrong type');
reset role;
select is((select count(*)::int from clients where name = 'Orphan Test Co'), 0,
  'and neither leaves the client behind (B-9 repro)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select public.create_three_pl_project_with_client('Orphan Test Co', null, '{"contract_period_months":12}'::jsonb) $$,
  'a retry with valid input works');
reset role;
select is((select count(*)::int from clients where name = 'Orphan Test Co'), 1, 'and creates the client once');

-- ---- Refusals ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select public.create_three_pl_project_with_client(' acme co ', null, '{}'::jsonb) $$,
  '23505', null, 'a name already taken (any case, any spacing) is refused');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('Owner Hack Co', null, '{"owner_id":"00000000-0000-4000-8000-0000000000b1"}'::jsonb) $$,
  '22023', 'The project has a field that can''t be set.', 'owner_id can''t be set by the caller');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('Client Hack Co', null, '{"client_id":"00000000-0000-4000-8000-00000000c001","status":"Lost"}'::jsonb) $$,
  '22023', 'The project has a field that can''t be set.', 'nor client_id or status');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('   ', null, '{}'::jsonb) $$,
  '22023', 'Client name is required.', 'a blank client name is refused');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('Array Co', null, '[]'::jsonb) $$,
  '22023', 'The project must be an object.', 'the project must be an object');
reset role;

-- No role: RLS refuses, and nothing is left.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok(
  $$ select public.create_three_pl_project_with_client('No Role Co', null, '{}'::jsonb) $$,
  '42501', null, 'an account without a role is refused');
reset role;
select is((select count(*)::int from clients where name in ('No Role Co', 'Owner Hack Co', 'Client Hack Co', 'Array Co')), 0,
  'no refused call left a client');
select is(
  (select count(*)::int from three_pl_projects where owner_id <> '00000000-0000-4000-8000-0000000000a1'), 0,
  'and every project created is the caller''s');

select * from finish();
rollback;
