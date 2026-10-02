-- Saved duty estimates are locked: any signed-in user can read them and save
-- their own, nobody can change one (not even the service role), and only the
-- owner or an admin can delete one. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.act_as(uid uuid, app_role text default 'logistics_expert')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  execute 'set local role authenticated';
end $$;

-- A valid estimate for the current user (created_by defaults to auth.uid()).
create function pg_temp.save_estimate(p_id uuid, p_created_by uuid default null)
returns void language plpgsql as $$
begin
  insert into duty_estimates (
    id, created_by, as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
    origin_country, shipment_mode, customs_value_original, customs_value_usd,
    base_duty_usd, fees_usd, total_usd, lines
  ) values (
    p_id, coalesce(p_created_by, auth.uid()), '2026-10-02', '6402993110', 'House slippers', '2026HTSRev20',
    'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 647.14, '[]'
  );
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'other@test.local', '{"role":"logistics_expert"}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}');

-- ---- Owner (a1) saves estimates ---------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0001') $$,
  'a signed-in user can save an estimate'
);
select lives_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0002') $$,
  'and another'
);
select throws_ok(
  $$ select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'a user cannot save an estimate in someone else''s name'
);
select throws_ok(
  $$ update duty_estimates set total_usd = 1 where id = '00000000-0000-4000-8000-0000000d0001' $$,
  '42501', null, 'the owner cannot change a saved estimate'
);
select throws_ok(
  $$ insert into duty_estimates (as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines)
     values ('2026-10-02', '6402993110', 'x', 'r', 'general', '6%', 'VN', 'Sea', 10000, 10000, 600, 47.14, 999, '[]') $$,
  '23514', null, 'the total must equal base duty plus fees'
);
select throws_ok(
  $$ insert into duty_estimates (as_of_date, hts_code, hts_description, hts_release_name, rate_column, rate_text,
       origin_country, shipment_mode, customs_value_original, customs_value_usd, base_duty_usd, fees_usd, total_usd, lines,
       original_currency, exchange_rate_to_usd)
     values ('2026-10-02', '6402993110', 'x', 'r', 'general', '6%', 'VN', 'Sea', 10000, 10800, 648, 47.14, 695.14, '[]',
       'EUR', 1.08) $$,
  '23514', null, 'a non-USD estimate must record where its exchange rate came from'
);

-- ---- Another user (b1): reads, can't delete -----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');

select is((select count(*)::int from duty_estimates), 2, 'another signed-in user can read saved estimates');
select is_empty(
  $$ delete from duty_estimates where id = '00000000-0000-4000-8000-0000000d0001' returning id $$,
  'a non-owner cannot delete an estimate'
);

-- ---- Owner deletes their own; admin deletes anyone's --------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select isnt_empty(
  $$ delete from duty_estimates where id = '00000000-0000-4000-8000-0000000d0001' returning id $$,
  'the owner can delete their estimate'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad', 'admin');
select throws_ok(
  $$ update duty_estimates set label = 'edited' where id = '00000000-0000-4000-8000-0000000d0002' $$,
  '42501', null, 'an admin cannot change a saved estimate either'
);
select isnt_empty(
  $$ delete from duty_estimates where id = '00000000-0000-4000-8000-0000000d0002' returning id $$,
  'an admin can delete anyone''s estimate'
);

-- ---- Locked for everyone, even with table privileges --------------------------
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select pg_temp.save_estimate('00000000-0000-4000-8000-0000000d0004');
reset role;

set local role service_role;
select throws_ok(
  $$ update duty_estimates set total_usd = 0 where id = '00000000-0000-4000-8000-0000000d0004' $$,
  '42501', null, 'the service role cannot change a saved estimate'
);
reset role;
select throws_like(
  $$ update duty_estimates set label = 'edited' where id = '00000000-0000-4000-8000-0000000d0004' $$,
  '%locked%', 'the lock trigger refuses changes even for the table owner'
);
select is(
  (select total_usd from duty_estimates where id = '00000000-0000-4000-8000-0000000d0004'),
  647.14::numeric, 'the saved total is unchanged'
);
select is(
  (select created_by from duty_estimates where id = '00000000-0000-4000-8000-0000000d0004'),
  '00000000-0000-4000-8000-0000000000a1'::uuid, 'created_by is the user who saved it'
);
select is(
  (select count(*)::int from duty_estimates), 1, 'only the remaining estimate is left'
);

select * from finish();
rollback;
