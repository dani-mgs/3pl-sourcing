-- Client users in the database: the helpers (is_client_user, my_client_id,
-- complete_password_change) and the profiles guard. A client user can only
-- exist for a real client, a staff account can't carry a client, and a client
-- with portal users can't be deleted. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client One'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Client Two');

-- ---- The helpers --------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p where p.oid in ('public.is_client_user()'::regprocedure, 'public.my_client_id()'::regprocedure,
                                  'public.complete_password_change()'::regprocedure,
                                  'public.has_staff_role()'::regprocedure, 'public.has_staff_role_user(uuid)'::regprocedure)),
  array['complete_password_change:true:search_path=""', 'has_staff_role:true:search_path=""',
        'has_staff_role_user:true:search_path=""', 'is_client_user:true:search_path=""', 'my_client_id:true:search_path=""'],
  'the client and staff helpers are security definer with an empty search_path');
select ok(
  not has_function_privilege('anon', 'public.is_client_user()', 'execute')
    and not has_function_privilege('anon', 'public.my_client_id()', 'execute')
    and not has_function_privilege('anon', 'public.complete_password_change()', 'execute')
    and not has_function_privilege('anon', 'public.has_staff_role()', 'execute'),
  'anon can run none of them');
select ok(
  has_function_privilege('authenticated', 'public.is_client_user()', 'execute')
    and has_function_privilege('authenticated', 'public.my_client_id()', 'execute')
    and has_function_privilege('authenticated', 'public.complete_password_change()', 'execute'),
  'signed-in users can (policies and the change-password action need them)');

-- ---- The profiles guard ------------------------------------------------------------------
select lives_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       ('00000000-0000-4000-8000-0000000000c1', 'client@test.local',
        '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","first_name":"Pat","must_change_password":true}') $$,
  'a client user for a real client is created');
select is(
  (select role || ':' || client_id from profiles where id = '00000000-0000-4000-8000-0000000000c1'),
  'client:00000000-0000-4000-8000-00000000c001', 'the profile mirrors the role and client');
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       (gen_random_uuid(), 'noclient@test.local', '{"role":"client"}') $$,
  '23514', null, 'a client user without a client is refused');
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       (gen_random_uuid(), 'ghost@test.local', '{"role":"client","client_id":"00000000-0000-4000-8000-00000000dead"}') $$,
  '23503', null, 'a client user for a client that doesn''t exist is refused');
select throws_ok(
  $$ insert into auth.users (id, email, raw_app_meta_data) values
       (gen_random_uuid(), 'bad@test.local', '{"role":"client","client_id":"not-a-uuid"}') $$,
  '22P02', null, 'a malformed client id is refused');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local',
   '{"role":"logistics_expert","client_id":"00000000-0000-4000-8000-00000000c002","must_change_password":true}');
select is(
  (select client_id from profiles where id = '00000000-0000-4000-8000-0000000000a1'), null,
  'a staff account''s client_id metadata is ignored, not mirrored');
select throws_ok(
  $$ update profiles set client_id = '00000000-0000-4000-8000-00000000c002' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'and a staff profile can''t be given a client');
select throws_ok(
  $$ delete from clients where id = '00000000-0000-4000-8000-00000000c001' $$,
  '23503', null, 'a client with portal users can''t be deleted');
select throws_ok(
  $$ update auth.users set raw_app_meta_data = raw_app_meta_data - 'client_id'
     where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '23514', null, 'a client user can''t lose its client');

-- ---- The helpers, as each user ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(is_client_user(), true, 'is_client_user() is true for the client');
select is(my_client_id(), '00000000-0000-4000-8000-00000000c001'::uuid, 'my_client_id() is its client');
select lives_ok($$ select complete_password_change() $$, 'the client clears its first-login flag');
reset role;
select is(
  (select raw_app_meta_data ? 'must_change_password' from auth.users where id = '00000000-0000-4000-8000-0000000000c1'),
  false, 'the flag is gone');
select is(
  (select raw_app_meta_data ->> 'role' || ':' || (raw_app_meta_data ->> 'client_id') from auth.users where id = '00000000-0000-4000-8000-0000000000c1'),
  'client:00000000-0000-4000-8000-00000000c001', 'and nothing else changed');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(is_client_user(), false, 'an expert is not a client user');
select is(my_client_id(), null, 'my_client_id() is null for staff, whatever their metadata says');
select lives_ok($$ select complete_password_change() $$, 'complete_password_change() runs for staff...');
reset role;
select is(
  (select raw_app_meta_data ? 'must_change_password' from auth.users where id = '00000000-0000-4000-8000-0000000000a1'),
  true, '...but changes nothing for them');

set local role anon;
select throws_ok($$ select public.my_client_id() $$, '42501', null, 'anon cannot call my_client_id()');
reset role;

-- Only the service role writes app_metadata, and the app refuses role changes
-- on client users; if one happened anyway, the client link goes with it.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"logistics_expert"}'
where id = '00000000-0000-4000-8000-0000000000c1';
select is(
  (select role || ':' || coalesce(client_id::text, 'none') from profiles where id = '00000000-0000-4000-8000-0000000000c1'),
  'logistics_expert:none', 'a user switched from client to staff keeps no client link');
select is(
  (select count(*)::int from profiles where role = 'client' and client_id is null), 0,
  'no client profile is without a client');

select * from finish();
rollback;
