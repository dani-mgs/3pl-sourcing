-- save_duty_estimate(): the one way the app saves a duty estimate once the
-- table's INSERT is revoked (step 2, a later migration). Step 1 (this file)
-- is additive: direct inserts by signed-in users still work until then.
--
-- Why: the amounts are calculated by the app on the server (rate parser,
-- exact arithmetic, additional-duty rules, all in TypeScript), and a
-- signed-in user could otherwise insert any internally consistent row through
-- the API. The function can only be executed by the service role, which the
-- save action uses after its own checks (docs/SECURITY.md, "Service-role
-- exception: saveEstimate"). The database can't recompute a duty, so it
-- re-checks what it can from its own tables: who may link, that the HTS line
-- and release are the current ones, the base rate text and column, the
-- exchange rate against fx_rates, and that the lines add up to the totals.
-- It can't prove the duty amounts themselves; those are right because the
-- server computed them.

-- Is this user an admin? The same fact as is_admin(), which reads it from the
-- caller's JWT: a token's app_metadata is built from auth.users'
-- raw_app_meta_data, so reading that column for a given user id gives the
-- same answer (pgTAP 15 checks that they agree).
create function is_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select raw_app_meta_data ->> 'role' = 'admin' from auth.users where id = p_user_id), false);
$$;

revoke all on function is_admin_user(uuid) from public, anon, authenticated;
grant execute on function is_admin_user(uuid) to service_role;

create function save_duty_estimate(p_user_id uuid, p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The only fields a caller may supply. id, created_by, created_at and
  -- anything else are never read from p_row.
  v_allowed constant text[] := array[
    'label', 'as_of_date', 'hts_code', 'hts_description', 'hts_ancestor_descriptions',
    'hts_release_name', 'hts_release_title', 'hts_release_start_date', 'rate_column',
    'rate_text', 'special_rate_text', 'origin_country', 'shipment_mode',
    'customs_value_original', 'original_currency', 'exchange_rate_to_usd',
    'exchange_rate_source', 'exchange_rate_date', 'customs_value_usd',
    'freight_insurance_deduction_usd', 'quantity', 'quantity_unit', 'base_duty_usd',
    'additional_duties_usd', 'fees_usd', 'total_usd', 'lines', 'warnings',
    'duty_reviews', 'forwarder_project_id', 'forwarder_quote_id', 'input_snapshot'
  ];
  v public.duty_estimates;
  v_today date := (now() at time zone 'utc')::date;
  v_line public.hts_lines;
  v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user.' using errcode = '42501';
  end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'The estimate must be an object.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_row) k where k <> all (v_allowed)) then
    raise exception 'The estimate has a field that can''t be set.' using errcode = '22023';
  end if;

  v := jsonb_populate_record(null::public.duty_estimates, p_row);

  -- Linking: only the project's owner or an admin, as the insert policy
  -- requires. (The quote-belongs-to-project trigger runs on the insert.)
  if v.forwarder_project_id is not null and not exists (
    select 1 from public.forwarder_projects fp
    where fp.id = v.forwarder_project_id
      and (fp.owner_id = p_user_id or public.is_admin_user(p_user_id))
  ) then
    raise exception 'Only the project''s owner or an admin can link an estimate to it.' using errcode = '42501';
  end if;

  -- Rows the table's checks don't cover.
  if jsonb_typeof(v.lines) <> 'array'
    or exists (select 1 from jsonb_array_elements(v.lines) e where jsonb_typeof(e) <> 'object')
    or jsonb_typeof(v.warnings) <> 'array'
    or exists (select 1 from jsonb_array_elements(v.warnings) e where jsonb_typeof(e) <> 'object')
    or jsonb_typeof(v.duty_reviews) <> 'array'
    or exists (select 1 from jsonb_array_elements(v.duty_reviews) e where jsonb_typeof(e) <> 'object') then
    raise exception 'lines, warnings and duty_reviews must be lists of objects.' using errcode = '23514';
  end if;

  -- The estimate is "as of" today in UTC (the app's todayUtc()); yesterday is
  -- accepted so a save that straddles midnight doesn't fail.
  if v.as_of_date is null or v.as_of_date not between v_today - 1 and v_today then
    raise exception 'The estimate''s date isn''t today (UTC).' using errcode = '23514';
  end if;

  -- The HTS line, its release and base rate are the current ones.
  select l.* into v_line
  from public.hts_lines l
  join public.hts_releases r on r.id = l.release_id and r.status = 'current'
  where r.name = v.hts_release_name and l.hts_code = v.hts_code;
  if not found
    or v_line.description is distinct from v.hts_description
    or v_line.ancestor_descriptions is distinct from v.hts_ancestor_descriptions
    or v_line.special_rate is distinct from v.special_rate_text
    or v.rate_text is distinct from (case v.rate_column when 'column2' then v_line.other_rate else v_line.general_rate end) then
    raise exception 'The HTS line doesn''t match the current HTS release.' using errcode = '23514';
  end if;
  if (v.rate_column = 'column2') <> exists (
    select 1 from public.hts_column2_countries c
    where c.country_code = v.origin_country
      and (c.effective_from is null or c.effective_from <= v.as_of_date)
      and (c.effective_to is null or c.effective_to >= v.as_of_date)
  ) then
    raise exception 'The rate column doesn''t match the country of origin.' using errcode = '23514';
  end if;

  -- Exchange rate: a daily-feed rate must be the stored one for that date.
  if v.exchange_rate_source = 'daily_feed' and not exists (
    select 1 from public.fx_rates f
    where f.currency = v.original_currency and f.rate_date = v.exchange_rate_date
      and f.rate_to_usd = v.exchange_rate_to_usd
  ) then
    raise exception 'The exchange rate isn''t the stored daily rate.' using errcode = '23514';
  end if;

  -- Customs value: the value in USD (rounded to the cent) less any deduction.
  if abs(v.customs_value_usd
    - (round(v.customs_value_original * v.exchange_rate_to_usd, 2) - coalesce(v.freight_insurance_deduction_usd, 0))) > 0.01 then
    raise exception 'The customs value doesn''t match the value and exchange rate.' using errcode = '23514';
  end if;

  -- The lines add up to the totals (each line is one cent-rounded amount).
  if (select count(*) from jsonb_array_elements(v.lines) e where e ->> 'kind' = 'duty') <> 1
    or exists (select 1 from jsonb_array_elements(v.lines) e
      where coalesce(e ->> 'kind', '') <> all (array['duty', 'additional', 'fee'])
        or jsonb_typeof(e -> 'amountUsd') is distinct from 'number')
    or abs(coalesce((select sum((e ->> 'amountUsd')::numeric) from jsonb_array_elements(v.lines) e where e ->> 'kind' = 'duty'), 0) - v.base_duty_usd) > 0.001
    or abs(coalesce((select sum((e ->> 'amountUsd')::numeric) from jsonb_array_elements(v.lines) e where e ->> 'kind' = 'additional'), 0) - v.additional_duties_usd) > 0.001
    or abs(coalesce((select sum((e ->> 'amountUsd')::numeric) from jsonb_array_elements(v.lines) e where e ->> 'kind' = 'fee'), 0) - v.fees_usd) > 0.001 then
    raise exception 'The lines don''t add up to the totals.' using errcode = '23514';
  end if;

  -- Explicit columns: nothing outside this list can be set from p_row.
  insert into public.duty_estimates (
    created_by, label, as_of_date, hts_code, hts_description, hts_ancestor_descriptions,
    hts_release_name, hts_release_title, hts_release_start_date, rate_column, rate_text,
    special_rate_text, origin_country, shipment_mode, customs_value_original, original_currency,
    exchange_rate_to_usd, exchange_rate_source, exchange_rate_date, customs_value_usd,
    freight_insurance_deduction_usd, quantity, quantity_unit, base_duty_usd, additional_duties_usd,
    fees_usd, total_usd, lines, warnings, duty_reviews, forwarder_project_id, forwarder_quote_id,
    input_snapshot
  ) values (
    p_user_id, v.label, v.as_of_date, v.hts_code, v.hts_description, v.hts_ancestor_descriptions,
    v.hts_release_name, v.hts_release_title, v.hts_release_start_date, v.rate_column, v.rate_text,
    v.special_rate_text, v.origin_country, v.shipment_mode, v.customs_value_original, v.original_currency,
    v.exchange_rate_to_usd, v.exchange_rate_source, v.exchange_rate_date, v.customs_value_usd,
    v.freight_insurance_deduction_usd, v.quantity, v.quantity_unit, v.base_duty_usd, v.additional_duties_usd,
    v.fees_usd, v.total_usd, v.lines, v.warnings, v.duty_reviews, v.forwarder_project_id, v.forwarder_quote_id,
    v.input_snapshot
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default: take it away explicitly.
revoke all on function save_duty_estimate(uuid, jsonb) from public, anon, authenticated;
grant execute on function save_duty_estimate(uuid, jsonb) to service_role;
