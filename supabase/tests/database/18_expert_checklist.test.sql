-- The expert checklist (migration 20261008060452): tariff editors and admins
-- read it; nobody writes the tables directly; set_checklist_item() is the one
-- way to tick, untick or add a note, checks the role per item, refuses a null
-- tick state or a stale version, and records every action. Ticking never
-- touches duty data or reviews. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create function pg_temp.act_as(uid uuid, meta jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', meta)::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'plain@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor@test.local', '{"role":"logistics_expert","tariff_editor":true}'),
  ('00000000-0000-4000-8000-0000000000e2', 'editor2@test.local', '{"role":"logistics_expert","tariff_editor":true}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

-- Ids of three seeded items: an editor item (B), an admin-only task (A) and
-- an admin-only decision (F).
select set_config('t.b1', (select id::text from expert_checklist_items where key = 'review_section_301_china'), false);
select set_config('t.a1', (select id::text from expert_checklist_items where key = 'access_grant_editors'), false);
select set_config('t.f1', (select id::text from expert_checklist_items where key = 'decide_multi_sku_entries'), false);

-- Duty data fingerprints, to show that ticking never touches them.
create temp table before_state as
select (select count(*) from duty_program_reviews) as reviews,
       (select count(*) from duty_programs) as programs,
       (select md5(string_agg(d::text, '' order by d.id)) from additional_duties d) as duties;
grant select on before_state to authenticated;

-- ---- Seed ---------------------------------------------------------------
select is((select count(*) from expert_checklist_items), 22::bigint, 'the seed has 22 items');
select is(
  (select string_agg(group_key || count, ' ' order by group_key)
   from (select group_key, count(*) from expert_checklist_items group by group_key) g),
  'A1 B4 C1 D9 E5 F2', 'items per group: A 1, B 4, C 1, D 9, E 5, F 2');
select is((select count(*) from expert_checklist_items where done or done_by is not null or version <> 0), 0::bigint, 'nothing starts ticked');
select is(
  (select array_agg(key order by key) from expert_checklist_items where editable_by = 'admin'),
  array['access_grant_editors', 'decide_forwarder_ranking_basis', 'decide_multi_sku_entries'],
  'only A and F are admin-only');
select is(
  (select count(*) from expert_checklist_items where key in ('load_232_buses', 'load_232_furniture', 'load_232_cabinets', 'load_232_polysilicon')
     and description ilike 'needs a developer to add the program first (no program exists in the app yet)%'),
  4::bigint, 'the four programs without a key say a developer must add the program first');

-- ---- Anon: nothing ----------------------------------------------------------
set local role anon;
select throws_ok($$ select * from expert_checklist_items $$, '42501', null, 'anon cannot read items');
select throws_ok($$ select * from expert_checklist_events $$, '42501', null, 'anon cannot read events');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, true, null, 0) $$,
  '42501', null, 'anon cannot run set_checklist_item');
reset role;

-- ---- Plain user: no read, no write --------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert"}');
select is_empty($$ select id from expert_checklist_items $$, 'a plain user sees no items');
select is_empty($$ select id from expert_checklist_events $$, 'a plain user sees no events');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, true, null, 0) $$,
  '42501', 'Not allowed.', 'a plain user cannot tick');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', '{"role":"logistics_expert","tariff_editor":"yes"}');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, true, null, 0) $$,
  '42501', 'Not allowed.', 'only the boolean true makes an editor');
reset role;

-- ---- Tariff editor: B-E yes; A and F no ---------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', '{"role":"logistics_expert","tariff_editor":true}');
select is((select count(*) from expert_checklist_items), 22::bigint, 'an editor reads all items');
select is(set_checklist_item(current_setting('t.b1')::uuid, true, null, 0), 1, 'an editor ticks a B item (version 1)');
select is(
  (select done and done_by = '00000000-0000-4000-8000-0000000000e1' and done_at is not null and updated_by = done_by
   from expert_checklist_items where id = current_setting('t.b1')::uuid),
  true, 'the tick records who and when');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.a1')::uuid, true, null, 0) $$,
  '42501', 'Not allowed.', 'an editor cannot tick an admin-only task');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.f1')::uuid, true, null, 0) $$,
  '42501', 'Not allowed.', 'an editor cannot tick a decision');
select throws_ok(
  $$ select set_checklist_item('00000000-0000-4000-8000-00000000ffff', true, null, 0) $$,
  '42501', 'Not allowed.', 'an unknown item looks the same as a forbidden one');

-- null, stale and over-long input.
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, null, null, 1) $$,
  '22023', 'The request is incomplete.', 'a null tick state is rejected');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, false, null, null) $$,
  '22023', 'The request is incomplete.', 'a null version is rejected');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, false, null, 0) $$,
  'PT409', 'This item was changed by someone else.', 'a stale version is rejected');
select throws_ok(
  $$ select set_checklist_item(current_setting('t.b1')::uuid, true, repeat('x', 501), 1) $$,
  '22023', 'The note is too long.', 'a note over 500 characters is rejected');
select is((select done from expert_checklist_items where id = current_setting('t.b1')::uuid), true, 'a rejected call changes nothing');

-- A second editor adds a note only: who/when of the tick stay.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2', '{"role":"logistics_expert","tariff_editor":true}');
select is(set_checklist_item(current_setting('t.b1')::uuid, true, repeat('x', 500), 1), 2, 'a 500-character note is accepted');
select is(
  (select done_by from expert_checklist_items where id = current_setting('t.b1')::uuid),
  '00000000-0000-4000-8000-0000000000e1'::uuid, 'a note-only change keeps who ticked');
select is(
  (select updated_by from expert_checklist_items where id = current_setting('t.b1')::uuid),
  '00000000-0000-4000-8000-0000000000e2'::uuid, 'but records who changed it last');
select is(set_checklist_item(current_setting('t.b1')::uuid, true, repeat('x', 500), 2), 2, 'saving the same thing again is a no-op (same version)');

-- Untick clears done_by / done_at; the events keep both actions.
select is(set_checklist_item(current_setting('t.b1')::uuid, false, null, 2), 3, 'an editor unticks (version 3)');
select is(
  (select not done and done_by is null and done_at is null and updated_by = '00000000-0000-4000-8000-0000000000e2' and note is null
   from expert_checklist_items where id = current_setting('t.b1')::uuid),
  true, 'untick clears done_by and done_at and records who unticked');
select is(
  (select array_agg(action || ':' || (actor = '00000000-0000-4000-8000-0000000000e1')::text || (actor = '00000000-0000-4000-8000-0000000000e2')::text order by id)
   from expert_checklist_events where item_id = current_setting('t.b1')::uuid),
  array['ticked:truefalse', 'note:falsetrue', 'unticked:falsetrue'],
  'history: ticked, note, unticked, each with its actor');

-- ---- Nobody writes the tables directly ------------------------------------------
select throws_ok($$ update expert_checklist_items set done = true $$, '42501', null, 'an editor cannot update items directly');
select throws_ok($$ delete from expert_checklist_items $$, '42501', null, 'an editor cannot delete items');
select throws_ok(
  $$ insert into expert_checklist_items (key, group_key, sort_order, title, description) values ('x', 'A', 1, 'x', 'x') $$,
  '42501', null, 'an editor cannot add items');
select throws_ok($$ insert into expert_checklist_events (item_id, action) values (current_setting('t.b1')::uuid, 'ticked') $$,
  '42501', null, 'an editor cannot write events');
select throws_ok($$ delete from expert_checklist_events $$, '42501', null, 'an editor cannot delete events');
reset role;

-- ---- Admin: everything, but still only through the function ------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', '{"role":"admin"}');
select is(set_checklist_item(current_setting('t.a1')::uuid, true, 'done', 0), 1, 'an admin ticks an admin-only task');
select is(set_checklist_item(current_setting('t.f1')::uuid, true, null, 0), 1, 'an admin ticks a decision');
select is(set_checklist_item(current_setting('t.b1')::uuid, true, null, 3), 4, 'an admin ticks an editor item');
select throws_ok($$ update expert_checklist_items set done = false $$, '42501', null, 'an admin cannot update items directly either');
select throws_ok($$ delete from expert_checklist_items $$, '42501', null, 'nor delete them');
select throws_ok($$ delete from expert_checklist_events $$, '42501', null, 'nor delete history');
reset role;

-- ---- Ticking changed no duty data ------------------------------------------------
select is(
  (select row(
     (select count(*) from duty_program_reviews),
     (select count(*) from duty_programs),
     (select md5(string_agg(d::text, '' order by d.id)) from additional_duties d))::text),
  (select row(reviews, programs, duties)::text from before_state),
  'ticks leave reviews, programs and duty rows unchanged');

select * from finish();
rollback;
