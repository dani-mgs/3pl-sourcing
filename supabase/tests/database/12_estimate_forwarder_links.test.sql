-- Duty estimates linked to a forwarder project or quote (migration
-- 20261003011811): only the project's owner or an admin can save a linked
-- estimate, the quote must belong to the project, linked rows stay locked,
-- and deleting the quote or project deletes its estimates. Unlinked
-- estimates are unchanged. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

-- A valid estimate for the current user, optionally linked.
create function pg_temp.save_estimate(
  p_id uuid,
  p_project uuid default null,
  p_quote uuid default null,
  p_deduction numeric default null,
  p_snapshot jsonb default '{"project": {}}'
)
returns void language plpgsql as $$
begin
  insert into duty_estimates (
    id, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
    origin_country, shipment_mode, customs_value_original, customs_value_usd,
    base_duty_usd, fees_usd, total_usd, lines,
    forwarder_project_id, forwarder_quote_id, freight_insurance_deduction_usd, input_snapshot
  ) values (
    p_id, '2026-10-03', '6402993110', 'House slippers', '2026HTSRev20',
    'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]',
    p_project, p_quote, p_deduction, case when p_project is null then null else p_snapshot end
  );
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');
-- Project P1 (owned by a1) with forwarder F1 and quotes Q1, Q2; project P2
-- (owned by b1) with forwarder F2 and quote Q3.
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'F1'),
  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000411', 'F2');
insert into forwarder_quotes (id, forwarder_id, scenario_group) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000402', 'A'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000402', 'B'),
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000412', 'A');

-- ---- Owner (a1) ---------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0001') $$,
  'unlinked estimates are unchanged'
);
select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-000000000401') $$,
  'the owner can link an estimate to their project'
);
select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000501', 1200) $$,
  'the owner can link an estimate to a quote in their project, with a deduction'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0004', '00000000-0000-4000-8000-000000000411') $$,
  '42501', null, 'a user cannot link an estimate to someone else''s project'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0005', '00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000511') $$,
  '23514', null, 'the quote must belong to the linked project'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0006', null, '00000000-0000-4000-8000-000000000501') $$,
  '23514', null, 'a quote link needs a project link'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0007', null, null, 500) $$,
  '23514', null, 'a deduction only exists on linked estimates'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0008', '00000000-0000-4000-8000-000000000401', null, null, null) $$,
  '23514', null, 'a linked estimate must keep its input snapshot'
);
select throws_ok(
  $$ update duty_estimates set input_snapshot = '{}' where id = '00000000-0000-4000-8000-0000000d0003' $$,
  '42501', null, 'a linked estimate is locked'
);

-- ---- Another user (b1): can't link to a1's project ---------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0009', '00000000-0000-4000-8000-000000000401') $$,
  '42501', null, 'a non-owner cannot link an estimate to the project'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0010', '00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000502') $$,
  '42501', null, 'a non-owner cannot link an estimate to a quote in the project'
);
select is(
  (select count(*)::int from duty_estimates where forwarder_project_id = '00000000-0000-4000-8000-000000000401'),
  2, 'a non-owner can still read the project''s estimates'
);

-- ---- Admin can link to anyone's project --------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');
select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0011', '00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000502') $$,
  'an admin can link an estimate to any project''s quote'
);

-- ---- Cascades (as the project owner) -----------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
delete from forwarder_quotes where id = '00000000-0000-4000-8000-000000000501';
select is(
  (select count(*)::int from duty_estimates where id = '00000000-0000-4000-8000-0000000d0003'),
  0, 'deleting a quote deletes its linked estimates'
);
delete from forwarders where id = '00000000-0000-4000-8000-000000000402';
select is(
  (select count(*)::int from duty_estimates where id = '00000000-0000-4000-8000-0000000d0011'),
  0, 'deleting a forwarder deletes the estimates linked to its quotes, including an admin''s'
);
delete from forwarder_projects where id = '00000000-0000-4000-8000-000000000401';
select is(
  (select count(*)::int from duty_estimates where id = '00000000-0000-4000-8000-0000000d0002'),
  0, 'deleting a project deletes its linked estimates'
);
select is(
  (select count(*)::int from duty_estimates where id = '00000000-0000-4000-8000-0000000d0001'),
  1, 'unlinked estimates are untouched'
);

select * from finish();
rollback;
