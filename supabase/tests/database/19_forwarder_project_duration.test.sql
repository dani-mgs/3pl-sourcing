-- forwarder_projects.project_duration_months: a nullable smallint limited to
-- 1-120 whole months, with permissions exactly as before (owner or admin
-- writes, anyone signed in reads, anon nothing). Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- ---- Shape ----------------------------------------------------------------
select has_column('forwarder_projects', 'project_duration_months', 'column exists');
select col_type_is('forwarder_projects', 'project_duration_months', 'smallint', 'column is smallint');
select col_is_null('forwarder_projects', 'project_duration_months', 'column is nullable');
select col_hasnt_default('forwarder_projects', 'project_duration_months', 'column has no default');
select is((select project_duration_months from forwarder_projects where id = '00000000-0000-4000-8000-000000000401'), null, 'an existing project has no duration');

-- ---- Range (as the owner) -------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select lives_ok($$ update forwarder_projects set project_duration_months = 1 where id = '00000000-0000-4000-8000-000000000401' $$, '1 is accepted');
select lives_ok($$ update forwarder_projects set project_duration_months = 120 where id = '00000000-0000-4000-8000-000000000401' $$, '120 is accepted');
select lives_ok($$ update forwarder_projects set project_duration_months = null where id = '00000000-0000-4000-8000-000000000401' $$, 'null is accepted');
select throws_ok($$ update forwarder_projects set project_duration_months = 0 where id = '00000000-0000-4000-8000-000000000401' $$, '23514', null, '0 is refused');
select throws_ok($$ update forwarder_projects set project_duration_months = 121 where id = '00000000-0000-4000-8000-000000000401' $$, '23514', null, '121 is refused');
select throws_ok($$ update forwarder_projects set project_duration_months = -3 where id = '00000000-0000-4000-8000-000000000401' $$, '23514', null, '-3 is refused');
select lives_ok($$ update forwarder_projects set project_duration_months = 12 where id = '00000000-0000-4000-8000-000000000401' $$, 'owner can set a duration');

-- ---- Permissions unchanged ------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is((select project_duration_months from forwarder_projects where id = '00000000-0000-4000-8000-000000000401'), 12::smallint, 'another signed-in user can read it');
select is_empty($$ update forwarder_projects set project_duration_months = 99 where id = '00000000-0000-4000-8000-000000000401' returning id $$, 'a non-owner cannot change it');

reset role;
select is((select project_duration_months from forwarder_projects where id = '00000000-0000-4000-8000-000000000401'), 12::smallint, 'value unchanged after the refused update');
select is(has_column_privilege('anon', 'forwarder_projects', 'project_duration_months', 'select'), false, 'anon cannot read the column');
select is(has_column_privilege('anon', 'forwarder_projects', 'project_duration_months', 'update'), false, 'anon cannot write the column');
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies where tablename = 'forwarder_projects'),
  array[
    'Authenticated users can view all forwarder projects',
    'Owner or admin can create forwarder projects',
    'Owner or admin can delete forwarder projects',
    'Owner or admin can update forwarder projects'
  ],
  'forwarder_projects policies are unchanged'
);

select * from finish();
rollback;
