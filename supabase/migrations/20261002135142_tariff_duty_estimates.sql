-- Saved Tariff Calculator estimates. Each row is a locked snapshot: the
-- inputs, the HTS line and release it used, the exchange rate with its
-- provenance, every calculated line with its rate and source, and the
-- warnings shown at the time. Rows can't be changed once saved (no update
-- privilege, plus a trigger for everyone else); to refresh an estimate, save
-- a new one. The owner or an admin can delete one.

create table duty_estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  -- Optional reference typed by the user, e.g. a client or PO.
  label text
    constraint duty_estimates_label_check check (char_length(label) <= 200),
  -- The day the rates were taken from (the estimate is "as of" this date).
  as_of_date date not null,

  hts_code text not null
    constraint duty_estimates_hts_code_check check (hts_code ~ '^([0-9]{8}|[0-9]{10})$'),
  hts_description text not null,
  hts_ancestor_descriptions text[] not null default '{}',
  hts_release_name text not null,
  hts_release_title text,
  hts_release_start_date date,
  -- Which HTS column the base rate came from: general (column 1) or
  -- column 2 (the origin is on hts_column2_countries).
  rate_column text not null
    constraint duty_estimates_rate_column_check check (rate_column in ('general', 'column2')),
  rate_text text not null,
  special_rate_text text,

  -- ISO 3166-1 alpha-2.
  origin_country text not null
    constraint duty_estimates_origin_country_check check (origin_country ~ '^[A-Z]{2}$'),
  shipment_mode text not null
    constraint duty_estimates_shipment_mode_check check (shipment_mode in ('Air', 'Sea', 'Road')),

  customs_value_original numeric(16,2) not null
    constraint duty_estimates_customs_value_original_check check (customs_value_original > 0),
  -- Same currencies, rate scale and provenance rules as forwarder_quotes.
  original_currency text not null default 'USD'
    constraint duty_estimates_original_currency_check
    check (original_currency in ('USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD',
      'AUD', 'MXN', 'INR', 'PHP', 'VND', 'THB', 'HKD', 'SGD', 'KRW')),
  exchange_rate_to_usd numeric(20,10) not null default 1
    constraint duty_estimates_exchange_rate_check check (exchange_rate_to_usd > 0),
  exchange_rate_source text
    constraint duty_estimates_exchange_rate_source_check
    check (exchange_rate_source in ('daily_feed', 'manual')),
  exchange_rate_date date,
  customs_value_usd numeric(16,2) not null
    constraint duty_estimates_customs_value_usd_check check (customs_value_usd > 0),

  -- Only for per-unit (specific or compound) rates, in the rate's unit.
  quantity numeric(16,4)
    constraint duty_estimates_quantity_check check (quantity > 0),
  quantity_unit text,

  base_duty_usd numeric(14,2) not null
    constraint duty_estimates_base_duty_check check (base_duty_usd >= 0),
  fees_usd numeric(14,2) not null
    constraint duty_estimates_fees_check check (fees_usd >= 0),
  total_usd numeric(14,2) not null,
  -- [{ kind, code, label, rateText, amountUsd, basis..., sourceLabel,
  --    sourceUrl, effectiveFrom }], in display order.
  lines jsonb not null
    constraint duty_estimates_lines_check check (jsonb_typeof(lines) = 'array'),
  -- [{ programKey, name, text, sourceUrl }] as shown when saved.
  warnings jsonb not null default '[]'
    constraint duty_estimates_warnings_check check (jsonb_typeof(warnings) = 'array'),

  constraint duty_estimates_total_check check (total_usd = base_duty_usd + fees_usd),
  constraint duty_estimates_quantity_unit_check
    check ((quantity is null) = (quantity_unit is null)),
  constraint duty_estimates_exchange_rate_provenance_check check (
    (original_currency = 'USD' and exchange_rate_to_usd = 1
      and exchange_rate_source is null and exchange_rate_date is null)
    or (original_currency <> 'USD'
      and exchange_rate_source is not null and exchange_rate_date is not null)
  )
);

create index duty_estimates_created_at_idx on duty_estimates (created_at desc);
create index duty_estimates_created_by_idx on duty_estimates (created_by);

-- Locked: nobody changes a saved estimate, not even the service role.
create function duty_estimates_prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Duty estimates are locked and cannot be changed; save a new estimate instead.'
    using errcode = '42501';
end;
$$;

create trigger duty_estimates_locked
  before update on duty_estimates
  for each row execute function duty_estimates_prevent_update();

alter table duty_estimates enable row level security;

create policy "Authenticated users can view duty estimates"
  on duty_estimates for select to authenticated
  using (true);

create policy "Users can save their own duty estimates"
  on duty_estimates for insert to authenticated
  with check (created_by = auth.uid());

create policy "Owner or admin can delete duty estimates"
  on duty_estimates for delete to authenticated
  using (created_by = auth.uid() or is_admin());

-- No update privilege at all.
revoke all on table duty_estimates from anon, authenticated;
grant select, insert, delete on table duty_estimates to authenticated;
