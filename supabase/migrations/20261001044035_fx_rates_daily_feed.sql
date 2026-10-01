-- Daily FX reference rates (Frankfurter v2 blended central-bank feed).
-- Written only by the /api/cron/fx-rates route using the service role;
-- signed-in users can read, nobody can write through the app.

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  -- The feed's own date for the rate (its last business day), not the day
  -- it was fetched.
  rate_date date not null,
  -- Every non-USD value of forwarder_quotes.original_currency; keep in step
  -- with forwarder_quotes_original_currency_check.
  currency text not null
    constraint fx_rates_currency_check
    check (currency in ('EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'MXN',
      'INR', 'PHP', 'VND', 'THB', 'HKD', 'SGD', 'KRW')),
  -- USD per 1 unit of currency, same meaning and scale as
  -- forwarder_quotes.exchange_rate_to_usd.
  rate_to_usd numeric(20,10) not null
    constraint fx_rates_rate_to_usd_positive check (rate_to_usd > 0),
  source text not null default 'frankfurter'
    constraint fx_rates_source_check check (source in ('frankfurter')),
  fetched_at timestamptz not null default now(),
  constraint fx_rates_rate_date_currency_key unique (rate_date, currency)
);

-- "Latest rate per currency" lookups.
create index fx_rates_currency_rate_date_idx on fx_rates (currency, rate_date desc);

alter table fx_rates enable row level security;

create policy "Authenticated users can read fx rates"
  on fx_rates for select to authenticated
  using (true);

-- No insert/update/delete policies: app users can't write. The cron route's
-- service-role client bypasses RLS but still needs table privileges.
revoke all on table fx_rates from anon, authenticated;
grant select on table fx_rates to authenticated;
grant select, insert, update on table fx_rates to service_role;
