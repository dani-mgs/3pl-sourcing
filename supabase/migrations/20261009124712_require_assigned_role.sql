-- Access needs a role an admin assigned (hardening after QA 2026-10-09).
--
-- Every SELECT policy was "to authenticated using (true)", so any account
-- that could sign in could read all clients, projects, quotes and tariff
-- data, whether or not an admin had given it a role. Production has signup
-- off and every account is admin-made, so this is defence in depth: an
-- account without app_metadata.role in the allowed set now sees and writes
-- nothing.
--
-- 1. has_app_role() / has_app_role_user(uuid): the live auth.users pattern of
--    is_admin() / is_admin_user(). The allowed roles must match USER_ROLES in
--    src/lib/admin/parse-admin-input.ts (a Vitest check compares them).
-- 2. One RESTRICTIVE policy per RLS table, ANDed with the existing policies
--    (none rewritten). (select ...) makes it an initPlan: run once per query.
-- 3. save_duty_estimate (service role, so RLS doesn't apply) refuses a user
--    without a role.
-- 4. The profiles mirror shows a missing role as 'none', not
--    'logistics_expert', so /admin shows the truth.
-- 5. Backfill: every existing user without a valid role gets
--    'logistics_expert', the access they have today, so nobody is locked out.
-- 6. TRUNCATE (which RLS doesn't cover) and profiles' unused INSERT/DELETE
--    are revoked from signed-in users.
-- 7. search_hts_lines becomes security definer with the same role check. With
--    a real RLS condition on hts_lines, Postgres won't use the full-text
--    index (@@ isn't leakproof) and a search took 1.7 s instead of 4 ms.

-- ---- 1. Helpers -------------------------------------------------------------
create function public.has_app_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' in ('admin', 'logistics_expert')
     from auth.users u
     where u.id = auth.uid()),
    false);
$$;

revoke all on function public.has_app_role() from public, anon;
grant execute on function public.has_app_role() to authenticated, service_role;

create function public.has_app_role_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' in ('admin', 'logistics_expert')
     from auth.users u
     where u.id = p_user_id),
    false);
$$;

revoke all on function public.has_app_role_user(uuid) from public, anon, authenticated;
grant execute on function public.has_app_role_user(uuid) to service_role;

-- ---- 4. Profile mirror: a missing role is 'none' -------------------------------
create or replace function public.handle_new_or_updated_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, role, tariff_editor)
  values (
    new.id,
    new.email,
    new.raw_app_meta_data ->> 'first_name',
    coalesce(new.raw_app_meta_data ->> 'role', 'none'),
    coalesce(new.raw_app_meta_data ->> 'tariff_editor', 'false') = 'true'
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        role = excluded.role,
        tariff_editor = excluded.tariff_editor;
  return new;
end;
$$;

-- ---- 5. Backfill ------------------------------------------------------------
-- Fires the trigger above, which mirrors the new role into profiles. Neither
-- auth.users nor profiles has an updated_at trigger to disable.
do $$
declare
  v_count integer;
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"logistics_expert"}'::jsonb
  where coalesce(raw_app_meta_data ->> 'role', '') not in ('admin', 'logistics_expert');
  get diagnostics v_count = row_count;
  raise notice 'require_assigned_role: gave % existing user(s) without a valid role the logistics_expert role', v_count;
end $$;

-- ---- 2. Restrictive policies ----------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['additional_duties', 'additional_duty_scope', 'clients', 'customs_fees', 'duty_estimates', 'duty_program_reviews', 'duty_programs', 'forwarder_projects', 'forwarder_quotes', 'forwarders', 'fx_rates', 'hts_chapter99_changes', 'hts_column2_countries', 'hts_lines', 'hts_releases', 'profiles', 'rate_details', 'recommendation', 'tariff_data_history', 'three_pl_projects', 'three_pl_providers'] loop
    execute format(
      'create policy "Requires an assigned role" on public.%I as restrictive for all to authenticated '
      'using ((select public.has_app_role())) with check ((select public.has_app_role()))', t);
  end loop;
end $$;

-- ---- 3. save_duty_estimate: same body, plus the role check ----------------------
create or replace function save_duty_estimate(p_user_id uuid, p_row jsonb)
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
    'duty_reviews', 'forwarder_project_id', 'forwarder_quote_id', 'input_snapshot', 'entry_date'
  ];
  v public.duty_estimates;
  v_today date := (now() at time zone 'utc')::date;
  v_line public.hts_lines;
  v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Unknown user.' using errcode = '42501';
  end if;
  if not public.has_app_role_user(p_user_id) then
    raise exception 'This account has no role yet.' using errcode = '42501';
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

  -- as_of_date is the day the estimate was calculated ("calculated on"): today
  -- in UTC (the app's todayUtc()); yesterday is accepted so a save that
  -- straddles midnight doesn't fail.
  if v.as_of_date is null or v.as_of_date not between v_today - 1 and v_today then
    raise exception 'The estimate''s date isn''t today (UTC).' using errcode = '23514';
  end if;

  -- entry_date is the day the goods are expected to enter the US. Code that
  -- predates it sends no entry_date: it defaults to the calculation day. It
  -- may be at most a day before the calculation day (a user west of UTC) and
  -- at most 366 days after it; past dates aren't supported.
  v.entry_date := coalesce(v.entry_date, v.as_of_date);
  if v.entry_date not between v.as_of_date - 1 and v.as_of_date + 366 then
    raise exception 'The expected entry date is outside the supported range.' using errcode = '23514';
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
      and (c.effective_from is null or c.effective_from <= v.entry_date)
      and (c.effective_to is null or c.effective_to >= v.entry_date)
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
    created_by, label, as_of_date, entry_date, hts_code, hts_description, hts_ancestor_descriptions,
    hts_release_name, hts_release_title, hts_release_start_date, rate_column, rate_text,
    special_rate_text, origin_country, shipment_mode, customs_value_original, original_currency,
    exchange_rate_to_usd, exchange_rate_source, exchange_rate_date, customs_value_usd,
    freight_insurance_deduction_usd, quantity, quantity_unit, base_duty_usd, additional_duties_usd,
    fees_usd, total_usd, lines, warnings, duty_reviews, forwarder_project_id, forwarder_quote_id,
    input_snapshot
  ) values (
    p_user_id, v.label, v.as_of_date, v.entry_date, v.hts_code, v.hts_description, v.hts_ancestor_descriptions,
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

revoke all on function save_duty_estimate(uuid, jsonb) from public, anon, authenticated;
grant execute on function save_duty_estimate(uuid, jsonb) to service_role;

-- ---- 6. Revokes -----------------------------------------------------------------
revoke truncate on table public.clients, public.forwarder_projects, public.forwarder_quotes, public.forwarders, public.profiles, public.rate_details, public.recommendation, public.three_pl_projects, public.three_pl_providers from authenticated, anon;
revoke insert, delete on table public.profiles from authenticated, anon;

-- ---- 7. search_hts_lines: same body, runs as owner, checks the role itself -------
create or replace function search_hts_lines(p_terms text[] default null, p_code text default null, p_limit integer default 150)
returns table (
  hts_code text,
  indent smallint,
  description text,
  ancestor_descriptions text[],
  units text[],
  general_rate text,
  rate_from_code text,
  has_children boolean,
  parents jsonb,
  may_apply jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query tsquery;
  v_upper text;
begin
  -- Runs as the owner so the full-text index can be used (RLS hides it: @@
  -- isn't leakproof). So it applies the role rule itself, as RLS would: an
  -- account without a role gets nothing. It only reads hts_lines,
  -- hts_releases and the duty programs, which everyone with a role can read.
  if not public.has_app_role() then
    return;
  end if;
  if (p_terms is null or cardinality(p_terms) = 0) = (p_code is null) then
    raise exception 'Give either search terms or a code.' using errcode = '22023';
  end if;
  if p_code is not null and p_code !~ '^[0-9]{2,10}$' then
    raise exception 'The code must be 2 to 10 digits.' using errcode = '22023';
  end if;
  if p_terms is not null and (
    cardinality(p_terms) > 8
    or exists (select 1 from unnest(p_terms) t where t !~ '^[a-z0-9]{1,40}$')
  ) then
    raise exception 'Search terms must be up to 8 words of letters and digits.' using errcode = '22023';
  end if;

  if p_code is not null then
    -- The next code of the same length bounds the subtree for the index:
    -- '6402' → '6403', '6499' → '6500'.
    v_upper := lpad((p_code::numeric + 1)::text, length(p_code), '0');
  else
    v_query := to_tsquery('english', (select string_agg(t || ':*', ' & ') from unnest(p_terms) t));
  end if;

  return query
  with matched as (
    select l.release_id, l.hts_code, l.indent, l.description, l.ancestor_descriptions, l.units,
      l.general_rate, l.rate_from_code, count(*) over () as total_count
    from public.hts_lines l
    join public.hts_releases r on r.id = l.release_id and r.status = 'current'
    where (p_code is null or (l.hts_code >= p_code and l.hts_code < v_upper and starts_with(l.hts_code, p_code)))
      and (v_query is null or l.search_vector @@ v_query)
    order by l.hts_code
    limit least(greatest(coalesce(p_limit, 150), 1), 500)
  ),
  -- Scope prefixes covering the line (its own prefixes) or under it.
  scope_hits as (
    select m.hts_code, d.program_key, d.origin_countries
    from matched m
    join public.additional_duty_scope s
      on s.hts_prefix = any (array(select left(m.hts_code, n) from generate_series(4, length(m.hts_code)) n))
      or (length(m.hts_code) < 10
          and s.hts_prefix > m.hts_code
          and s.hts_prefix < lpad((m.hts_code::numeric + 1)::text, length(m.hts_code), '0')
          and starts_with(s.hts_prefix, m.hts_code))
    join public.additional_duties d on d.id = s.duty_id
    where not s.excluded
      and d.hts_scope = 'listed'
      and d.rate_type <> 'exempt'
      and d.legal_status <> 'expired'
      and (d.effective_to is null or d.effective_to >= current_date)
  ),
  -- origins null = any origin.
  program_hits as (
    select h.hts_code, h.program_key, h.origin_countries as origins
    from scope_hits h
    union all
    select m.hts_code, p.key, p.trigger_origins
    from matched m
    join public.duty_programs p
      on p.trigger_hts_prefixes is not null
      and exists (
        select 1 from unnest(p.trigger_hts_prefixes) tp
        where starts_with(m.hts_code, tp) or starts_with(tp, m.hts_code)
      )
  ),
  badges as (
    select g.hts_code,
      jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'origins', g.origins) order by p.sort_order) as may_apply
    from (
      select ph.hts_code, ph.program_key,
        case when bool_or(ph.origins is null) then null
          else to_jsonb(array(
            select distinct c
            from program_hits x, unnest(x.origins) c
            where x.hts_code = ph.hts_code and x.program_key = ph.program_key
            order by c
          ))
        end as origins
      from program_hits ph
      group by ph.hts_code, ph.program_key
    ) g
    join public.duty_programs p on p.key = g.program_key
    group by g.hts_code
  )
  select m.hts_code, m.indent, m.description, m.ancestor_descriptions, m.units, m.general_rate, m.rate_from_code,
    exists (
      select 1 from public.hts_lines c
      where c.release_id = m.release_id
        and c.hts_code > m.hts_code
        and c.hts_code < lpad((m.hts_code::numeric + 1)::text, length(m.hts_code), '0')
        and starts_with(c.hts_code, m.hts_code)
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object('code', a.hts_code, 'description', a.description) order by a.hts_code)
      from public.hts_lines a
      where a.release_id = m.release_id
        and a.hts_code = any (array[left(m.hts_code, 4), left(m.hts_code, 6), left(m.hts_code, 8)])
        and a.hts_code <> m.hts_code
    ), '[]'::jsonb),
    coalesce(b.may_apply, '[]'::jsonb),
    m.total_count
  from matched m
  left join badges b on b.hts_code = m.hts_code
  order by m.hts_code;
end;
$$;

revoke all on function search_hts_lines(text[], text, integer) from public, anon;
grant execute on function search_hts_lines(text[], text, integer) to authenticated;
