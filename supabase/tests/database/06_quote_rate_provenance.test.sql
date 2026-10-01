-- forwarder_quotes rate provenance (migration 20261001045751): the trigger's
-- defaults and the check constraint, independent of the app.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'owner@test.local');
insert into clients (id, name) values ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'pgTAP Forwarder');

-- USD: any source or date sent is cleared.
insert into forwarder_quotes (id, forwarder_id, scenario_group, original_currency, exchange_rate_source, exchange_rate_date)
values ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000402', 'A', 'USD', 'daily_feed', '2026-10-01');
select results_eq(
  $$ select exchange_rate_source, exchange_rate_date from forwarder_quotes where id = '00000000-0000-4000-8000-000000000501' $$,
  $$ values (null::text, null::date) $$,
  'a USD quote never keeps a rate source or date'
);

-- Non-USD with no source (e.g. older app code): recorded as manual, today.
insert into forwarder_quotes (id, forwarder_id, scenario_group, original_currency, exchange_rate_to_usd)
values ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000402', 'A', 'EUR', 1.08);
select results_eq(
  $$ select exchange_rate_source, exchange_rate_date from forwarder_quotes where id = '00000000-0000-4000-8000-000000000502' $$,
  $$ values ('manual'::text, current_date) $$,
  'a non-USD quote saved without a source is recorded as manual, dated today'
);

select lives_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group, original_currency, exchange_rate_to_usd, exchange_rate_source, exchange_rate_date)
     values ('00000000-0000-4000-8000-000000000402', 'A', 'KRW', 0.00074, 'daily_feed', '2026-10-01') $$,
  'a dated daily-feed rate is accepted'
);
select lives_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group, original_currency, exchange_rate_to_usd, exchange_rate_source)
     values ('00000000-0000-4000-8000-000000000402', 'A', 'EUR', 1.1, 'manual_legacy') $$,
  'a legacy rate without a date is accepted'
);
select throws_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group, original_currency, exchange_rate_to_usd, exchange_rate_source)
     values ('00000000-0000-4000-8000-000000000402', 'A', 'EUR', 1.1, 'daily_feed') $$,
  '23514', null, 'a daily-feed rate without a date is rejected'
);
select throws_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group, original_currency, exchange_rate_to_usd, exchange_rate_source, exchange_rate_date)
     values ('00000000-0000-4000-8000-000000000402', 'A', 'EUR', 1.1, 'manual_legacy', '2026-10-01') $$,
  '23514', null, 'a legacy rate with a date is rejected'
);
select throws_ok(
  $$ insert into forwarder_quotes (forwarder_id, scenario_group, original_currency, exchange_rate_to_usd, exchange_rate_source, exchange_rate_date)
     values ('00000000-0000-4000-8000-000000000402', 'A', 'EUR', 1.1, 'guessed', '2026-10-01') $$,
  '23514', null, 'an unknown rate source is rejected'
);

-- Switching an existing quote to USD clears its provenance on update too.
update forwarder_quotes set original_currency = 'USD', exchange_rate_to_usd = 1
  where id = '00000000-0000-4000-8000-000000000502';
select results_eq(
  $$ select exchange_rate_source, exchange_rate_date from forwarder_quotes where id = '00000000-0000-4000-8000-000000000502' $$,
  $$ values (null::text, null::date) $$,
  'changing a quote to USD clears its rate source and date'
);

select * from finish();
rollback;
