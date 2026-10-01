-- A signed-in user who doesn't own a project can read it but can't change or
-- delete it, or anything under it, on both modules. The owner and an admin
-- can. RLS answers a refused UPDATE/DELETE with zero rows rather than an
-- error, so each refusal is checked by "no row came back" and by re-reading
-- the row afterwards. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');

-- Everything below is owned by user a1.
insert into three_pl_projects (id, owner_id, client_id, target_geography) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'original');
insert into three_pl_providers (id, three_pl_project_id, company_name, location) values
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000301', 'pgTAP 3PL', 'original');
insert into rate_details (provider_id, storage_rate) values
  ('00000000-0000-4000-8000-000000000302', 1);
insert into recommendation (three_pl_project_id, priority) values
  ('00000000-0000-4000-8000-000000000301', 'Cost Savings');
insert into forwarder_projects (id, owner_id, client_id, cargo_description) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'original');
insert into forwarders (id, forwarder_project_id, company_name, headquarters) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'pgTAP Forwarder', 'original');
insert into forwarder_quotes (id, forwarder_id, scenario_group, notes) values
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000402', 'Lane A', 'original');

-- ---- Another signed-in user (b1): every update and delete is refused --------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');

select is_empty($$ update three_pl_projects set target_geography = 'hacked' where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'non-owner cannot update a 3PL project');
select is_empty($$ update three_pl_providers set location = 'hacked' where id = '00000000-0000-4000-8000-000000000302' returning id $$, 'non-owner cannot update a 3PL provider');
select is_empty($$ update rate_details set storage_rate = 999 where provider_id = '00000000-0000-4000-8000-000000000302' returning provider_id $$, 'non-owner cannot update rate details');
select is_empty($$ update recommendation set priority = 'Turnaround Time' where three_pl_project_id = '00000000-0000-4000-8000-000000000301' returning three_pl_project_id $$, 'non-owner cannot update a recommendation');
select is_empty($$ update forwarder_projects set cargo_description = 'hacked' where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'non-owner cannot update a forwarder project');
select is_empty($$ update forwarders set headquarters = 'hacked' where id = '00000000-0000-4000-8000-000000000402' returning id $$, 'non-owner cannot update a forwarder');
select is_empty($$ update forwarder_quotes set notes = 'hacked' where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'non-owner cannot update a forwarder quote');

select is_empty($$ delete from forwarder_quotes where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'non-owner cannot delete a forwarder quote');
select is_empty($$ delete from forwarders where id = '00000000-0000-4000-8000-000000000402' returning id $$, 'non-owner cannot delete a forwarder');
select is_empty($$ delete from forwarder_projects where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'non-owner cannot delete a forwarder project');
select is_empty($$ delete from recommendation where three_pl_project_id = '00000000-0000-4000-8000-000000000301' returning three_pl_project_id $$, 'non-owner cannot delete a recommendation');
select is_empty($$ delete from rate_details where provider_id = '00000000-0000-4000-8000-000000000302' returning provider_id $$, 'non-owner cannot delete rate details');
select is_empty($$ delete from three_pl_providers where id = '00000000-0000-4000-8000-000000000302' returning id $$, 'non-owner cannot delete a 3PL provider');
select is_empty($$ delete from three_pl_projects where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'non-owner cannot delete a 3PL project');

-- A non-owner can't hand a project to themselves either.
select is_empty($$ update three_pl_projects set owner_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'non-owner cannot take ownership of a 3PL project');

-- ---- Re-read as the database owner: nothing changed, nothing deleted --------
reset role;
select is((select target_geography from three_pl_projects where id = '00000000-0000-4000-8000-000000000301'), 'original', '3PL project unchanged');
select is((select location from three_pl_providers where id = '00000000-0000-4000-8000-000000000302'), 'original', '3PL provider unchanged');
select is((select storage_rate from rate_details where provider_id = '00000000-0000-4000-8000-000000000302'), 1::numeric, 'rate details unchanged');
select is((select priority from recommendation where three_pl_project_id = '00000000-0000-4000-8000-000000000301'), 'Cost Savings', 'recommendation unchanged');
select is((select cargo_description from forwarder_projects where id = '00000000-0000-4000-8000-000000000401'), 'original', 'forwarder project unchanged');
select is((select headquarters from forwarders where id = '00000000-0000-4000-8000-000000000402'), 'original', 'forwarder unchanged');
select is((select notes from forwarder_quotes where id = '00000000-0000-4000-8000-000000000403'), 'original', 'forwarder quote unchanged');
select is((select owner_id from three_pl_projects where id = '00000000-0000-4000-8000-000000000301'), '00000000-0000-4000-8000-0000000000a1'::uuid, '3PL project owner unchanged');

-- ---- The owner can update everything --------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select isnt_empty($$ update three_pl_projects set target_geography = 'by owner' where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'owner can update their 3PL project');
select isnt_empty($$ update three_pl_providers set location = 'by owner' where id = '00000000-0000-4000-8000-000000000302' returning id $$, 'owner can update their 3PL provider');
select isnt_empty($$ update rate_details set storage_rate = 2 where provider_id = '00000000-0000-4000-8000-000000000302' returning provider_id $$, 'owner can update their rate details');
select isnt_empty($$ update recommendation set priority = 'Turnaround Time' where three_pl_project_id = '00000000-0000-4000-8000-000000000301' returning three_pl_project_id $$, 'owner can update their recommendation');
select isnt_empty($$ update forwarder_projects set cargo_description = 'by owner' where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'owner can update their forwarder project');
select isnt_empty($$ update forwarders set headquarters = 'by owner' where id = '00000000-0000-4000-8000-000000000402' returning id $$, 'owner can update their forwarder');
select isnt_empty($$ update forwarder_quotes set notes = 'by owner' where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'owner can update their forwarder quote');

-- Only an admin can reassign ownership: an owner can't give their project
-- away, on either module.
select throws_ok(
  $$ update three_pl_projects set owner_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-000000000301' $$,
  '42501', null, 'owner cannot reassign their 3PL project to another user'
);
select throws_ok(
  $$ update forwarder_projects set owner_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-000000000401' $$,
  '42501', null, 'owner cannot reassign their forwarder project to another user'
);

-- ---- An admin can update anyone's -----------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');

select isnt_empty($$ update three_pl_projects set target_geography = 'by admin' where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'admin can update any 3PL project');
select isnt_empty($$ update three_pl_providers set location = 'by admin' where id = '00000000-0000-4000-8000-000000000302' returning id $$, 'admin can update any 3PL provider');
select isnt_empty($$ update rate_details set storage_rate = 3 where provider_id = '00000000-0000-4000-8000-000000000302' returning provider_id $$, 'admin can update any rate details');
select isnt_empty($$ update recommendation set priority = 'Cost Savings' where three_pl_project_id = '00000000-0000-4000-8000-000000000301' returning three_pl_project_id $$, 'admin can update any recommendation');
select isnt_empty($$ update forwarder_projects set cargo_description = 'by admin' where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'admin can update any forwarder project');
select isnt_empty($$ update forwarders set headquarters = 'by admin' where id = '00000000-0000-4000-8000-000000000402' returning id $$, 'admin can update any forwarder');
select isnt_empty($$ update forwarder_quotes set notes = 'by admin' where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'admin can update any forwarder quote');

-- Admin reassignment (what /admin does): the project moves to b1.
select isnt_empty($$ update three_pl_projects set owner_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-000000000301' returning id $$, 'admin can reassign a 3PL project');
select isnt_empty($$ update forwarder_projects set owner_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'admin can reassign a forwarder project');

-- ---- And the (new) owner can delete -----------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select isnt_empty($$ delete from forwarder_quotes where id = '00000000-0000-4000-8000-000000000403' returning id $$, 'the new owner can delete a quote on the reassigned project');

reset role;
select * from finish();
rollback;
