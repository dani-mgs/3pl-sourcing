-- Profiles are created and kept in sync from auth.users by a trigger. A
-- signed-in user can read them but not change, add, or remove any profile —
-- in particular, nobody can make themselves an admin through this table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}');

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('role', 'logistics_expert'))::text, true);
set local role authenticated;

select isnt_empty($$ select * from profiles where id = '00000000-0000-4000-8000-0000000000b1' $$, 'a signed-in user can read profiles');
select throws_ok(
  $$ update profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'a user cannot make themselves an admin'
);
select throws_ok(
  $$ update profiles set first_name = 'Changed' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'a user cannot edit their own profile row directly'
);
select throws_ok(
  $$ update profiles set first_name = 'Changed' where id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'a user cannot edit someone else''s profile'
);
select throws_ok(
  $$ insert into profiles (id, email, role) values (gen_random_uuid(), 'fake@test.local', 'admin') $$,
  '42501', null, 'a user cannot add a profile'
);
select throws_ok(
  $$ delete from profiles where id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'a user cannot delete a profile (no delete privilege)'
);

reset role;
select results_eq(
  $$ select role, first_name from profiles where id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('logistics_expert'::text, null::text) $$,
  'the profile is unchanged'
);

select * from finish();
rollback;
