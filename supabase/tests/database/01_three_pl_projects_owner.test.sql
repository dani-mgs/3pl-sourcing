-- three_pl_projects inserts: the owner_id must be the signed-in user (or the
-- inserter must be an admin). Everything runs in one transaction and is
-- rolled back, so nothing is left in the local database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Sign in as a user for the rest of the statement batch (role + JWT claims,
-- the same things PostgREST sets from a real session).
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

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$ insert into three_pl_projects (owner_id, client_id)
     values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001') $$,
  '42501', null,
  'a user cannot create a 3PL project owned by someone else'
);

select lives_ok(
  $$ insert into three_pl_projects (owner_id, client_id)
     values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001') $$,
  'a user can create a 3PL project they own'
);

select throws_ok(
  $$ insert into forwarder_projects (owner_id, client_id)
     values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001') $$,
  '42501', null,
  'a user cannot create a forwarder project owned by someone else'
);

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');

select lives_ok(
  $$ insert into three_pl_projects (owner_id, client_id)
     values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001') $$,
  'an admin can create a 3PL project for another user'
);

reset role;
select * from finish();
rollback;
