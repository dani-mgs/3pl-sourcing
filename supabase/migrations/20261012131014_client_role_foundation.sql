-- Client role foundation (client dashboard plan, Phase 1).
--
-- External client users get the role 'client' plus app_metadata.client_id,
-- written only by the server (create-client-user.ts, service role). They must
-- see NOTHING internal: every internal table keeps one restrictive policy
-- that only staff pass.
--
-- 1. has_app_role() / has_app_role_user(uuid) become has_staff_role() /
--    has_staff_role_user(uuid), same body. Once 'client' is a role, "has an
--    app role" would read as "any role", which is exactly the trap. The old
--    functions are dropped so nothing can call the ambiguous name.
-- 2. The 21 restrictive policies are recreated on the new name.
-- 3. search_hts_lines and save_duty_estimate call the new names.
-- 4. is_client_user() / my_client_id(): live auth.users, like is_admin().
-- 5. complete_password_change(): a client clears its own
--    must_change_password flag after changing its password (the change-
--    password server action calls it right after auth.updateUser).
-- 6. profiles.client_id mirrors app_metadata.client_id, with a foreign key to
--    clients and a check that only clients (and every client) have one. So a
--    client user can only exist for a real client, a staff account can't
--    carry a client_id, and a client with portal users can't be deleted.
-- 7. client_entitlements: one row per client (no row = free tier). Staff
--    read, a client reads only its own row, only admins write.
--
-- No backfill: no user has the client role yet, and existing profiles keep
-- client_id null (allowed for every non-client role).

-- ---- 1. Staff-role helpers ------------------------------------------------------
-- STAFF ONLY. This list must never include 'client': every internal table's
-- restrictive policy calls has_staff_role(), so adding 'client' here would
-- open all internal data to external client users. It must match
-- STAFF_ROLES in src/lib/admin/parse-admin-input.ts (role-list-sync.test.ts
-- compares them and fails if 'client' appears).
create function public.has_staff_role()
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

revoke all on function public.has_staff_role() from public, anon;
grant execute on function public.has_staff_role() to authenticated, service_role;

-- STAFF ONLY, as above. Used by save_duty_estimate (service role).
create function public.has_staff_role_user(p_user_id uuid)
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

revoke all on function public.has_staff_role_user(uuid) from public, anon, authenticated;
grant execute on function public.has_staff_role_user(uuid) to service_role;

-- ---- 2. Restrictive policies on the new name --------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['additional_duties', 'additional_duty_scope', 'clients', 'customs_fees', 'duty_estimates', 'duty_program_reviews', 'duty_programs', 'forwarder_projects', 'forwarder_quotes', 'forwarders', 'fx_rates', 'hts_chapter99_changes', 'hts_column2_countries', 'hts_lines', 'hts_releases', 'profiles', 'rate_details', 'recommendation', 'tariff_data_history', 'three_pl_projects', 'three_pl_providers'] loop
    execute format('drop policy "Requires an assigned role" on public.%I', t);
    execute format(
      'create policy "Requires a staff role" on public.%I as restrictive for all to authenticated '
      'using ((select public.has_staff_role())) with check ((select public.has_staff_role()))', t);
  end loop;
end $$;

-- ---- 4. Client helpers ------------------------------------------------------------
create function public.is_client_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' = 'client'
     from auth.users u
     where u.id = auth.uid()),
    false);
$$;

revoke all on function public.is_client_user() from public, anon;
grant execute on function public.is_client_user() to authenticated, service_role;

-- The signed-in client user's client, or null (staff, no role, or malformed
-- metadata: the text is checked before the cast, so it never raises).
create function public.my_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.raw_app_meta_data ->> 'role' = 'client'
     and u.raw_app_meta_data ->> 'client_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (u.raw_app_meta_data ->> 'client_id')::uuid
  end
  from auth.users u
  where u.id = auth.uid();
$$;

revoke all on function public.my_client_id() from public, anon;
grant execute on function public.my_client_id() to authenticated, service_role;

-- ---- 5. Clearing the first-login flag -----------------------------------------------
-- Removes only must_change_password, only for the caller, only if a client.
-- The change-password server action calls it right after the password change
-- succeeds. Calling it without changing the password only affects the
-- caller's own account (the inviter still knows the one-time password), so
-- Phase 3 must also refuse client approvals while the flag is set
-- (docs/SECURITY.md).
create function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data - 'must_change_password'
  where id = auth.uid()
    and raw_app_meta_data ->> 'role' = 'client'
    and raw_app_meta_data ? 'must_change_password';
end;
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

-- ---- 6. profiles.client_id ------------------------------------------------------------
alter table public.profiles
  add column client_id uuid references public.clients (id) on delete restrict;
alter table public.profiles
  add constraint profiles_client_id_matches_role check ((role = 'client') = (client_id is not null));
create index profiles_client_id_idx on public.profiles (client_id) where client_id is not null;

-- The mirror now copies client_id for client users. A bad or missing
-- client_id makes the auth.users write fail (cast, foreign key or check), so
-- a client user can't be created or kept without a real client.
create or replace function public.handle_new_or_updated_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'none');
begin
  insert into public.profiles (id, email, first_name, role, tariff_editor, client_id)
  values (
    new.id,
    new.email,
    new.raw_app_meta_data ->> 'first_name',
    v_role,
    coalesce(new.raw_app_meta_data ->> 'tariff_editor', 'false') = 'true',
    case when v_role = 'client' then (new.raw_app_meta_data ->> 'client_id')::uuid end
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        role = excluded.role,
        tariff_editor = excluded.tariff_editor,
        client_id = excluded.client_id;
  return new;
end;
$$;

-- ---- 7. client_entitlements ------------------------------------------------------------
create table public.client_entitlements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'market_report')),
  valid_until timestamptz,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_entitlements is
  'Paid tier per client. No row, or valid_until in the past, means free. Admin-only writes.';

-- granted_by is always the signed-in admin (null for service-role seeds), so
-- it can't be spoofed; created_at can't be rewritten.
create function public.set_client_entitlement_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger client_entitlements_audit
  before insert or update on public.client_entitlements
  for each row execute function public.set_client_entitlement_audit();
create trigger client_entitlements_set_updated_at
  before update on public.client_entitlements
  for each row execute function public.set_updated_at();

alter table public.client_entitlements enable row level security;

-- The one table a client may read. Restrictive like the staff policy on every
-- other table, but a client passes for its own row; writes stay staff-only.
create policy "Staff, or the client's own row" on public.client_entitlements
  as restrictive for all to authenticated
  using ((select public.has_staff_role()) or client_id = (select public.my_client_id()))
  with check ((select public.has_staff_role()));
create policy "Staff and the client can read entitlements" on public.client_entitlements
  for select to authenticated
  using ((select public.has_staff_role()) or client_id = (select public.my_client_id()));
create policy "Admins can add entitlements" on public.client_entitlements
  for insert to authenticated with check (public.is_admin());
create policy "Admins can change entitlements" on public.client_entitlements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can remove entitlements" on public.client_entitlements
  for delete to authenticated using (public.is_admin());

revoke all on table public.client_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.client_entitlements to authenticated;
grant select, insert, update, delete on table public.client_entitlements to service_role;

-- ---- 3. Callers of the old names: same bodies, new names ---------------------------
-- search_hts_lines runs as owner (for the full-text index), so it applies the
-- staff check itself: clients and accounts without a role get nothing.
CREATE OR REPLACE FUNCTION public.search_hts_lines(p_terms text[] DEFAULT NULL::text[], p_code text DEFAULT NULL::text, p_limit integer DEFAULT 150)
 RETURNS TABLE(hts_code text, indent smallint, description text, ancestor_descriptions text[], units text[], general_rate text, rate_from_code text, has_children boolean, parents jsonb, may_apply jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query tsquery;
  v_upper text;
begin
  -- Runs as the owner so the full-text index can be used (RLS hides it: @@
  -- isn't leakproof). So it applies the role rule itself, as RLS would: an
  -- account without a staff role (clients included) gets nothing. It only reads hts_lines,
  -- hts_releases and the duty programs, which only staff can read.
  if not public.has_staff_role() then
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
$function$
;

-- save_duty_estimate runs as the service role: only staff may save.
CREATE OR REPLACE FUNCTION public.save_duty_estimate(p_user_id uuid, p_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not public.has_staff_role_user(p_user_id) then
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
$function$
;

-- ---- 1b. Drop the ambiguous old names (nothing references them now) --------------
drop function public.has_app_role();
drop function public.has_app_role_user(uuid);
