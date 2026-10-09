-- fx_rates is written only by the cron job (service role). Signed-in users
-- can read it and the latest-rate view, but never write to it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- A date no seeded rate uses, and always the latest, so this also passes on a
-- seeded database.
insert into fx_rates (rate_date, currency, rate_to_usd) values ('2099-01-01', 'EUR', 1.08);
-- A real admin: role checks read auth.users, not the token.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test.local', '{"role":"admin"}');

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated',
  'app_metadata', json_build_object('role', 'admin'))::text, true);
set local role authenticated;

select isnt_empty('select * from fx_rates', 'a signed-in user can read fx_rates');
select results_eq(
  $$ select currency, rate_to_usd from fx_rates_latest where currency = 'EUR' $$,
  $$ values ('EUR'::text, 1.08::numeric) $$,
  'a signed-in user can read the latest-rate view'
);
select throws_ok(
  $$ insert into fx_rates (rate_date, currency, rate_to_usd) values ('2026-10-02', 'EUR', 2) $$,
  '42501', null, 'a signed-in user cannot insert rates (even an admin)'
);
select throws_ok($$ update fx_rates set rate_to_usd = 2 $$, '42501', null, 'a signed-in user cannot update rates');
select throws_ok($$ delete from fx_rates $$, '42501', null, 'a signed-in user cannot delete rates');
select throws_ok($$ truncate fx_rates $$, '42501', null, 'a signed-in user cannot truncate rates');

reset role;
select is((select rate_to_usd from fx_rates where currency = 'EUR' and rate_date = '2099-01-01'), 1.08::numeric, 'the stored rate is unchanged');

select * from finish();
rollback;
