-- forwarder_quotes.scenario_group is now optional: a quote can be saved without
-- it, old quotes keep their stored text, and permissions are as before.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'pgTAP Forwarder');
-- An old quote, as saved before the change.
insert into forwarder_quotes (id, forwarder_id, scenario_group) values
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000402', 'DDP - FCL');

-- ---- Shape ----------------------------------------------------------------
select col_is_null('forwarder_quotes', 'scenario_group', 'scenario_group is nullable');
select col_type_is('forwarder_quotes', 'scenario_group', 'text', 'scenario_group is still text');
select ok(exists (select 1 from pg_indexes where tablename = 'forwarder_quotes' and indexname = 'forwarder_quotes_forwarder_id_scenario_group_idx'), 'the (forwarder_id, scenario_group) index is still there');
select is((select scenario_group from forwarder_quotes where id = '00000000-0000-4000-8000-000000000403'), 'DDP - FCL', 'an old quote keeps its text');

-- ---- The owner can save without it, and edits leave old text alone --------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ insert into forwarder_quotes (id, forwarder_id, incoterm) values ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000402', 'DDP') $$,
  'a new quote can be inserted without a scenario group');
select lives_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group) values ('00000000-0000-4000-8000-000000000402', 'still accepted') $$,
  'code that still sends a scenario group keeps working');
select lives_ok(
  $$ update forwarder_quotes set notes = 'edited' where id = '00000000-0000-4000-8000-000000000403' $$,
  'an old quote can be edited without sending a scenario group');
select is((select scenario_group from forwarder_quotes where id = '00000000-0000-4000-8000-000000000403'), 'DDP - FCL', 'the old text is untouched by that edit');
select is((select scenario_group from forwarder_quotes where id = '00000000-0000-4000-8000-000000000404'), null, 'the new quote has none');

-- ---- Permissions unchanged ------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is_empty($$ update forwarder_quotes set notes = 'hacked' where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'a non-owner still cannot update a quote');
select throws_ok(
  $$ insert into forwarder_quotes (forwarder_id) values ('00000000-0000-4000-8000-000000000402') $$,
  '42501', null, 'a non-owner still cannot insert a quote');

reset role;
select is(has_column_privilege('anon', 'forwarder_quotes', 'scenario_group', 'select'), false, 'anon still cannot read the column');
select is(
  -- Permissive only: the restrictive role policy is checked in pgTAP 24.
  (select array_agg(policyname::text order by policyname) from pg_policies where tablename = 'forwarder_quotes' and permissive = 'PERMISSIVE'),
  array[
    'Authenticated users can view all forwarder quotes',
    'Owner or admin can delete forwarder quotes',
    'Owner or admin can insert forwarder quotes',
    'Owner or admin can update forwarder quotes'
  ],
  'forwarder_quotes policies are unchanged'
);

select * from finish();
rollback;
