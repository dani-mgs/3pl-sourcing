-- Display names are admin-only (QA regression 2026-10-09, B-3). The name is
-- app_metadata.first_name, which only the service role can write (the admin
-- rename and create-user actions); profiles.first_name mirrors it. What a user
-- can write about themselves (user_metadata, through auth.updateUser) is
-- ignored, and profiles can't be written directly. The backfill of existing
-- names is checked by an upgrade run, since this suite starts with no users.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', 'logistics_expert'))::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'user@test.local',
   '{"role":"logistics_expert","tariff_editor":true,"first_name":"Real Name"}', '{"first_name":"Real Name"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local',
   '{"role":"logistics_expert","first_name":"Other User"}', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'signup@test.local',
   '{"role":"logistics_expert"}', '{"first_name":"Picked At Signup"}');

-- ---- The trigger --------------------------------------------------------------
select is(
  (select prosecdef from pg_proc where oid = 'public.handle_new_or_updated_user'::regproc),
  true, 'the profile sync is security definer');
select is(
  (select proconfig from pg_proc where oid = 'public.handle_new_or_updated_user'::regproc),
  array['search_path=""'], 'with an empty search_path');

-- ---- New users ----------------------------------------------------------------
select is((select first_name from profiles where email = 'user@test.local'), 'Real Name',
  'a new user''s name comes from app_metadata');
select is((select first_name from profiles where email = 'signup@test.local'), null,
  'a name only in user_metadata (e.g. chosen at signup) is ignored');

-- ---- A user can't rename themselves ----------------------------------------------
-- This is the change auth.updateUser({ data: { first_name } }) makes (B-3 repro).
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"first_name":"Other User"}'
  where email = 'user@test.local';
select is((select first_name from profiles where email = 'user@test.local'), 'Real Name',
  'renaming yourself in user_metadata changes nothing (B-3 repro)');
update auth.users set raw_user_meta_data = '{"first_name":null}' where email = 'user@test.local';
select is((select first_name from profiles where email = 'user@test.local'), 'Real Name',
  'nor does clearing it');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ update profiles set first_name = 'Other User' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'a user cannot rename themselves through profiles');
select throws_ok(
  $$ update profiles set first_name = 'Hacked' where id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'nor anyone else');
select throws_ok(
  $$ insert into profiles (id, email, first_name) values (gen_random_uuid(), 'fake@test.local', 'Real Name') $$,
  '42501', null, 'nor add a profile with someone''s name');
reset role;
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'first_name', 'update')
    and not has_table_privilege('authenticated', 'auth.users', 'update'),
  'signed-in users have no update privilege on profiles.first_name or auth.users');

-- ---- An admin can (updateUserById merges app_metadata keys) ------------------------
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"first_name":"Renamed By Admin"}'
  where email = 'user@test.local';
select results_eq(
  $$ select first_name, role, tariff_editor from profiles where email = 'user@test.local' $$,
  $$ values ('Renamed By Admin'::text, 'logistics_expert'::text, true) $$,
  'an admin rename changes the name and keeps role and tariff editor');
select is((select first_name from profiles where email = 'other@test.local'), 'Other User',
  'other users are untouched');

-- Other changes to the user (e.g. a role change) keep the name.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
  where email = 'user@test.local';
select is((select first_name from profiles where email = 'user@test.local'), 'Renamed By Admin',
  'a role change keeps the name');
update auth.users set email = 'user2@test.local' where email = 'user@test.local';
select is((select first_name from profiles where email = 'user2@test.local'), 'Renamed By Admin',
  'an email change keeps the name');

select * from finish();
rollback;
