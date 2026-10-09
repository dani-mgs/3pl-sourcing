-- create_forwarder_project_with_client (QA regression 2026-10-09, the
-- forwarder follow-up to B-9): a new client and its forwarder project are
-- created together or not at all, as the caller (RLS applies), with owner,
-- status and client set by the function. Rolled back at the end.
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
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP 27 Acme Co');

-- ---- The function ---------------------------------------------------------------
select is(
  (select p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') from pg_proc p
   where p.oid = 'public.create_forwarder_project_with_client(text, text, jsonb)'::regprocedure),
  'false:search_path=""', 'security invoker (RLS applies), with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.create_forwarder_project_with_client(text, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.create_forwarder_project_with_client(text, text, jsonb)', 'execute'),
  'signed-in users can run it, anon cannot');

-- ---- Success: both, together ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
create temp table created as
  select public.create_forwarder_project_with_client(
    '  pgTAP 27 New Co  ', ' B2B ',
    '{"origin_country":"Vietnam","project_duration_months":12,"weight_kg":1234.5,"pallets":4,
      "shipment_mode":"Sea","shipment_type":"FCL","incoterms_to_compare":["FOB","DDP"],"hs_code":"0402"}'::jsonb
  ) as project_id;
reset role;
select results_eq(
  $$ select p.owner_id, p.status, c.name, c.business_model, p.origin_country, p.project_duration_months,
            p.weight_kg, p.pallets, p.shipment_mode, p.shipment_type, p.incoterms_to_compare, p.hs_code
     from forwarder_projects p join clients c on c.id = p.client_id
     where p.id = (select project_id from created) $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'Active'::text, 'pgTAP 27 New Co'::text, 'B2B'::text,
             'Vietnam'::text, 12::smallint, 1234.5::numeric(14,3), 4, 'Sea'::text, 'FCL'::text,
             array['FOB', 'DDP']::text[], '0402'::text) $$,
  'creates the client (trimmed) and the project, owned by the caller and Active, with typed values (the HS code keeps its zero)');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
create temp table minimal as
  select public.create_forwarder_project_with_client('pgTAP 27 Minimal Co', null, '{}'::jsonb) as project_id;
reset role;
select is(
  (select incoterms_to_compare from forwarder_projects where id = (select project_id from minimal)),
  '{}'::text[], 'an empty project is fine: incoterms_to_compare defaults to empty');

-- ---- Atomicity: a project that fails leaves no client ----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Orphan Co', null, '{"project_duration_months":0}'::jsonb) $$,
  '23514', null, 'a project that breaks a check constraint is refused');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Orphan Co', null, '{"incoterms_to_compare":["XYZ"]}'::jsonb) $$,
  '23514', null, 'so is an incoterm that isn''t allowed');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Orphan Co', null, '{"pallets":"lots"}'::jsonb) $$,
  '22P02', null, 'and a value of the wrong type');
reset role;
select is((select count(*)::int from clients where name = 'pgTAP 27 Orphan Co'), 0,
  'and none leaves the client behind');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Orphan Co', null, '{"project_duration_months":6}'::jsonb) $$,
  'a retry with valid input works');
reset role;
select is((select count(*)::int from clients where name = 'pgTAP 27 Orphan Co'), 1, 'and creates the client once');

-- ---- Refusals ----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select public.create_forwarder_project_with_client(' PGTAP 27 acme co ', null, '{}'::jsonb) $$,
  '23505', null, 'a name already taken (any case, any spacing) is refused');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Owner Hack', null, '{"owner_id":"00000000-0000-4000-8000-0000000000b1"}'::jsonb) $$,
  '22023', 'The project has a field that can''t be set.', 'owner_id can''t be set by the caller');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Client Hack', null, '{"client_id":"00000000-0000-4000-8000-00000000c001"}'::jsonb) $$,
  '22023', 'The project has a field that can''t be set.', 'nor client_id');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Status Hack', null, '{"status":"Completed"}'::jsonb) $$,
  '22023', 'The project has a field that can''t be set.', 'nor status (a new project starts Active)');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('   ', null, '{}'::jsonb) $$,
  '22023', 'Client name is required.', 'a blank client name is refused');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 Array Co', null, '[]'::jsonb) $$,
  '22023', 'The project must be an object.', 'the project must be an object');
reset role;

-- No role: RLS refuses, and nothing is left.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok(
  $$ select public.create_forwarder_project_with_client('pgTAP 27 No Role Co', null, '{}'::jsonb) $$,
  '42501', null, 'an account without a role is refused');
reset role;
select is(
  (select count(*)::int from clients where name in
     ('pgTAP 27 No Role Co', 'pgTAP 27 Owner Hack', 'pgTAP 27 Client Hack', 'pgTAP 27 Status Hack', 'pgTAP 27 Array Co')), 0,
  'no refused call left a client');

select * from finish();
rollback;
