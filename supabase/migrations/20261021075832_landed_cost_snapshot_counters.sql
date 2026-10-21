-- Landed Cost version numbers are never reused (a fix to 20261021074001,
-- before its first deploy). Versions will leave the app as PDFs, so a
-- deleted v3 must never be followed by a different v3.
--
-- landed_cost_snapshot_counters holds each workspace's last version number.
-- Only save_landed_cost_snapshot() touches it (security definer, under its
-- existing per-workspace row lock): no API role has any privilege on it, and
-- RLS is on with no policies. It isn't a column on landed_cost_workspaces
-- because writing that would bump the workspace's updated_at and break the
-- stale check the lock relies on. The counter row goes with its workspace
-- (on delete cascade), which can only be deleted once it has no versions.
--
-- save_landed_cost_snapshot() is replaced with the same signature, checks and
-- grants; only the version number changes: last_version_no + 1, starting
-- from a workspace's highest existing version when it has no counter yet.

create table public.landed_cost_snapshot_counters (
  workspace_id uuid primary key references public.landed_cost_workspaces (id) on delete cascade,
  last_version_no integer not null
    constraint landed_cost_snapshot_counters_last_version_no_check check (last_version_no >= 0)
);

alter table public.landed_cost_snapshot_counters enable row level security;
revoke all on table public.landed_cost_snapshot_counters from public, anon, authenticated, service_role;

-- Workspaces locked before this migration (none in production; any local
-- ones) start from their highest version. A new table: no updated_at trigger
-- to disable.
insert into public.landed_cost_snapshot_counters (workspace_id, last_version_no)
select s.workspace_id, max(s.version_no) from public.landed_cost_snapshots s group by s.workspace_id;

create or replace function public.save_landed_cost_snapshot(p_user_id uuid, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The only fields a caller may supply. id, version_no, created_by,
  -- created_at and hts_release_id are never read from p_row.
  v_top constant text[] := array[
    'workspace_id', 'as_of_date', 'workspace_name', 'entry_date', 'workspace_updated_at', 'hts_release_name',
    'hts_release_title', 'hts_release_start_date', 'schema_version', 'inputs', 'result', 'origin_count',
    'baseline_label', 'baseline_per_unit_usd', 'incomplete'];
  v_inputs_keys constant text[] := array[
    'id', 'ownerId', 'name', 'entryDate', 'currency', 'baselineScenarioId', 'createdAt', 'updatedAt', 'skuLines', 'scenarios'];
  v_line_keys constant text[] := array['id', 'skuCode', 'description', 'htsCode', 'quantity', 'dutyQuantity'];
  v_scenario_keys constant text[] := array[
    'id', 'label', 'originCountry', 'supplierName', 'incoterm', 'shipmentMode', 'entryType', 'freightTotalUsd',
    'freightBasis', 'volumetricDivisor', 'isBaseline', 'items', 'otherCosts'];
  v_item_keys constant text[] := array[
    'skuLineId', 'fobUnitPriceUsd', 'pcsPerCarton', 'cartonLengthCm', 'cartonWidthCm', 'cartonHeightCm', 'cartonGrossKg'];
  v_cost_keys constant text[] := array['id', 'label', 'amountUsd'];
  v_result_keys constant text[] := array['calculatedOn', 'entryDate', 'release', 'origins', 'comparison', 'comparisonNote'];
  v_origin_keys constant text[] := array[
    'scenarioId', 'label', 'isBaseline', 'units', 'totalUsd', 'perUnitUsd', 'status', 'entryFees', 'otherCosts', 'skus'];
  v_fees_keys constant text[] := array['enteredValueUsd', 'entryType', 'entryTypeSource', 'mpf', 'hmf', 'warnings'];
  v_sku_keys constant text[] := array[
    'skuLineId', 'quantity', 'productUsd', 'freightUsd', 'dutiesUsd', 'mpfUsd', 'hmfUsd', 'otherUsd', 'totalUsd',
    'perUnitUsd', 'perUnitExact', 'duty'];
  v_duty_keys constant text[] := array[
    'htsCode', 'rateColumn', 'rateText', 'effectiveDutyRate', 'incomplete', 'dutiesUsd', 'lines', 'warnings',
    'dutyReviews', 'oldestReview', 'scheduledChanges'];
  v_estimate_line_keys constant text[] := array[
    'kind', 'code', 'label', 'rateText', 'amountUsd', 'detail', 'sourceLabel', 'sourceUrl', 'effectiveFrom', 'heading',
    'effectiveTo', 'legalStatus', 'sourceCheckedOn', 'notes'];
  v_comparison_keys constant text[] := array['baselineId', 'caution', 'results'];
  v_compared_keys constant text[] := array[
    'id', 'label', 'isBaseline', 'totalUsd', 'notComparableReasons', 'modeNote', 'comparable', 'differenceUsd',
    'differencePctText', 'perUnitDifferenceUsd', 'vsBaseline', 'drivers', 'rank', 'rankPosition'];

  v_today date := (now() at time zone 'utc')::date;
  v_ws public.landed_cost_workspaces;
  v_release public.hts_releases;
  v_inputs jsonb;
  v_result jsonb;
  v_origins jsonb;
  v_origin jsonb;
  v_sku jsonb;
  v_scenario public.landed_cost_scenarios;
  v_quantity numeric;
  v_fob numeric;
  v_units numeric;
  v_total numeric;
  v_sum record;
  v_baseline jsonb;
  v_baseline_total numeric;
  v_compared jsonb;
  v_as_of date;
  v_version integer;
  v_id uuid;
begin
  -- ---- Who ----
  if p_user_id is null or not public.has_staff_role_user(p_user_id) then
    raise exception 'Only staff can lock a version.' using errcode = '42501';
  end if;

  -- ---- Shape: allow-listed keys at every level the checks read ----
  if not public.landed_cost_keys_ok(p_row, v_top) then
    raise exception 'The version has a field that can''t be set.' using errcode = 'LC422';
  end if;
  v_inputs := p_row -> 'inputs';
  v_result := p_row -> 'result';
  v_origins := v_result -> 'origins';
  if not public.landed_cost_keys_ok(v_inputs, v_inputs_keys)
     or not public.landed_cost_snapshot_list_ok(v_inputs -> 'skuLines', v_line_keys)
     or not public.landed_cost_snapshot_list_ok(v_inputs -> 'scenarios', v_scenario_keys)
     or exists (select 1 from jsonb_array_elements(v_inputs -> 'scenarios') s
                where not public.landed_cost_snapshot_list_ok(s -> 'items', v_item_keys)
                   or not public.landed_cost_snapshot_list_ok(s -> 'otherCosts', v_cost_keys))
     or not public.landed_cost_keys_ok(v_result, v_result_keys)
     or not public.landed_cost_keys_ok(v_result -> 'release', array['name', 'title', 'startDate'])
     or not public.landed_cost_snapshot_list_ok(v_origins, v_origin_keys)
     or jsonb_array_length(v_origins) = 0
     or exists (select 1 from jsonb_array_elements(v_origins) o
                where not public.landed_cost_keys_ok(o -> 'status', array['incomplete', 'includesManualRate', 'unverified'])
                   or jsonb_typeof(o -> 'status' -> 'incomplete') is distinct from 'boolean'
                   or not public.landed_cost_keys_ok(o -> 'entryFees', v_fees_keys)
                   or not public.landed_cost_keys_ok(o -> 'entryFees' -> 'mpf', array['usd', 'line'])
                   or not (jsonb_typeof(o -> 'entryFees' -> 'hmf') = 'null'
                           or public.landed_cost_keys_ok(o -> 'entryFees' -> 'hmf', array['usd', 'line']))
                   or not public.landed_cost_snapshot_list_ok(o -> 'otherCosts', array['label', 'amountUsd'])
                   or not public.landed_cost_snapshot_list_ok(o -> 'skus', v_sku_keys)
                   or jsonb_array_length(o -> 'skus') = 0)
     or exists (select 1 from jsonb_array_elements(v_origins) o, jsonb_array_elements(o -> 'skus') s
                where not public.landed_cost_keys_ok(s -> 'duty', v_duty_keys)
                   or not public.landed_cost_snapshot_list_ok(s -> 'duty' -> 'lines', v_estimate_line_keys)
                   or coalesce(jsonb_typeof(s -> 'duty' -> 'warnings'), '') <> 'array'
                   or coalesce(jsonb_typeof(s -> 'duty' -> 'dutyReviews'), '') <> 'array'
                   or coalesce(jsonb_typeof(s -> 'duty' -> 'scheduledChanges'), '') <> 'array')
     or not (jsonb_typeof(v_result -> 'comparison') = 'null'
             or (public.landed_cost_keys_ok(v_result -> 'comparison', v_comparison_keys)
                 and public.landed_cost_snapshot_list_ok(v_result -> 'comparison' -> 'results', v_compared_keys))) then
    raise exception 'The version has a field that can''t be set.' using errcode = 'LC422';
  end if;

  -- ---- The workspace, locked so version numbers (and draft saves) wait their turn ----
  select w.* into v_ws from public.landed_cost_workspaces w where w.id = (p_row ->> 'workspace_id')::uuid for update;
  if not found then
    raise exception 'The workspace doesn''t exist.' using errcode = 'P0002';
  end if;
  if v_ws.owner_id <> p_user_id and not public.is_admin_user(p_user_id) then
    raise exception 'Only the workspace''s owner or an admin can lock a version.' using errcode = '42501';
  end if;

  -- ---- The saved draft, as it is now ----
  if (p_row ->> 'workspace_updated_at')::timestamptz is distinct from v_ws.updated_at
     or (v_inputs ->> 'updatedAt')::timestamptz is distinct from v_ws.updated_at then
    raise exception 'The workspace changed since it was calculated.' using errcode = 'LC409';
  end if;
  if p_row ->> 'workspace_name' is distinct from v_ws.name or v_inputs ->> 'name' is distinct from v_ws.name
     or (p_row ->> 'entry_date')::date is distinct from v_ws.entry_date
     or (v_inputs ->> 'entryDate')::date is distinct from v_ws.entry_date
     or (v_result ->> 'entryDate')::date is distinct from v_ws.entry_date
     or (v_inputs ->> 'id')::uuid is distinct from v_ws.id
     or (v_inputs ->> 'ownerId')::uuid is distinct from v_ws.owner_id
     or (v_inputs ->> 'baselineScenarioId')::uuid is distinct from v_ws.baseline_scenario_id then
    raise exception 'The version doesn''t match the saved workspace.' using errcode = 'LC409';
  end if;
  -- The same SKU lines (id, code, HTS code, quantity), each once.
  if (select count(*) from jsonb_array_elements(v_inputs -> 'skuLines'))
       <> (select count(*) from public.landed_cost_sku_lines l where l.workspace_id = v_ws.id)
     or exists (
       select 1 from public.landed_cost_sku_lines l
       where l.workspace_id = v_ws.id
         and (select count(*) from jsonb_array_elements(v_inputs -> 'skuLines') e
              where (e ->> 'id')::uuid = l.id and e ->> 'skuCode' = l.sku_code and e ->> 'htsCode' = l.hts_code
                and (e ->> 'quantity')::numeric = l.quantity) <> 1) then
    raise exception 'The version doesn''t match the saved workspace.' using errcode = 'LC409';
  end if;
  -- The same origins, items (FOB) and other costs.
  if (select count(*) from jsonb_array_elements(v_inputs -> 'scenarios'))
       <> (select count(*) from public.landed_cost_scenarios s where s.workspace_id = v_ws.id)
     or exists (
       select 1 from public.landed_cost_scenarios s
       where s.workspace_id = v_ws.id
         and (select count(*) from jsonb_array_elements(v_inputs -> 'scenarios') e
              where (e ->> 'id')::uuid = s.id and e ->> 'label' = s.label and e ->> 'originCountry' = s.origin_country
                and e ->> 'incoterm' = s.incoterm and e ->> 'shipmentMode' = s.shipment_mode
                and e ->> 'entryType' = s.entry_type and e ->> 'freightBasis' = s.freight_basis
                and (e ->> 'freightTotalUsd')::numeric is not distinct from s.freight_total_usd
                and (select count(*) from jsonb_array_elements(e -> 'items'))
                      = (select count(*) from public.landed_cost_scenario_items i where i.scenario_id = s.id)
                and not exists (
                  select 1 from public.landed_cost_scenario_items i
                  where i.scenario_id = s.id
                    and not exists (select 1 from jsonb_array_elements(e -> 'items') ei
                                    where (ei ->> 'skuLineId')::uuid = i.sku_line_id
                                      and (ei ->> 'fobUnitPriceUsd')::numeric is not distinct from i.fob_unit_price_usd))
                and (select count(*) from jsonb_array_elements(e -> 'otherCosts'))
                      = (select count(*) from public.landed_cost_other_costs c where c.scenario_id = s.id)) <> 1) then
    raise exception 'The version doesn''t match the saved workspace.' using errcode = 'LC409';
  end if;

  -- ---- As of today (UTC); yesterday is accepted so a lock across midnight doesn't fail ----
  v_as_of := (p_row ->> 'as_of_date')::date;
  if v_as_of is null or v_as_of not between v_today - 1 and v_today or (v_result ->> 'calculatedOn')::date is distinct from v_as_of then
    raise exception 'The version''s date isn''t today (UTC).' using errcode = '23514';
  end if;

  -- ---- The current HTS release, and every matched HTS line in it ----
  select r.* into v_release from public.hts_releases r where r.status = 'current' and r.name = p_row ->> 'hts_release_name';
  if not found
     or v_release.title is distinct from p_row ->> 'hts_release_title'
     or v_release.release_start_date is distinct from (p_row ->> 'hts_release_start_date')::date
     or v_result -> 'release' ->> 'name' is distinct from v_release.name
     or v_result -> 'release' ->> 'title' is distinct from v_release.title
     or (v_result -> 'release' ->> 'startDate')::date is distinct from v_release.release_start_date then
    raise exception 'The version wasn''t calculated on the current HTS release.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_origins) o, jsonb_array_elements(o -> 'skus') s
    where not exists (select 1 from public.hts_lines l where l.release_id = v_release.id and l.hts_code = s -> 'duty' ->> 'htsCode')) then
    raise exception 'An HTS code isn''t in the current HTS release.' using errcode = '23514';
  end if;

  -- ---- The amounts add up, origin by origin ----
  if jsonb_array_length(v_origins) <> (select count(*) from public.landed_cost_scenarios s where s.workspace_id = v_ws.id) then
    raise exception 'Every origin must be in the version.' using errcode = '23514';
  end if;
  for v_origin in select * from jsonb_array_elements(v_origins) loop
    select s.* into v_scenario from public.landed_cost_scenarios s
    where s.workspace_id = v_ws.id and s.id = (v_origin ->> 'scenarioId')::uuid;
    if not found or v_scenario.label <> v_origin ->> 'label'
       or (v_origin ->> 'isBaseline')::boolean is distinct from (v_scenario.id = v_ws.baseline_scenario_id)
       or (select count(*) from jsonb_array_elements(v_origins) o where o ->> 'scenarioId' = v_origin ->> 'scenarioId') <> 1 then
      raise exception 'An origin doesn''t match the saved workspace.' using errcode = '23514';
    end if;
    -- Every SKU line once.
    if jsonb_array_length(v_origin -> 'skus') <> (select count(*) from public.landed_cost_sku_lines l where l.workspace_id = v_ws.id) then
      raise exception 'Every SKU line must be in each origin.' using errcode = '23514';
    end if;

    for v_sku in select * from jsonb_array_elements(v_origin -> 'skus') loop
      select l.quantity, i.fob_unit_price_usd into v_quantity, v_fob
      from public.landed_cost_sku_lines l
      join public.landed_cost_scenario_items i on i.sku_line_id = l.id and i.scenario_id = v_scenario.id
      where l.workspace_id = v_ws.id and l.id = (v_sku ->> 'skuLineId')::uuid;
      if not found or v_fob is null
         or (select count(*) from jsonb_array_elements(v_origin -> 'skus') s where s ->> 'skuLineId' = v_sku ->> 'skuLineId') <> 1
         or public.landed_cost_snapshot_count(v_sku -> 'quantity') <> v_quantity then
        raise exception 'A SKU doesn''t match the saved workspace.' using errcode = '23514';
      end if;
      v_total := public.landed_cost_snapshot_money(v_sku -> 'totalUsd');
      if public.landed_cost_snapshot_money(v_sku -> 'productUsd') <> round(v_quantity * v_fob, 2)
         or public.landed_cost_snapshot_money(v_sku -> 'productUsd') + public.landed_cost_snapshot_money(v_sku -> 'freightUsd')
            + public.landed_cost_snapshot_money(v_sku -> 'dutiesUsd') + public.landed_cost_snapshot_money(v_sku -> 'mpfUsd')
            + public.landed_cost_snapshot_money(v_sku -> 'hmfUsd') + public.landed_cost_snapshot_money(v_sku -> 'otherUsd') <> v_total
         or public.landed_cost_snapshot_money(v_sku -> 'dutiesUsd') <> public.landed_cost_snapshot_money(v_sku -> 'duty' -> 'dutiesUsd')
         or public.landed_cost_snapshot_money(v_sku -> 'perUnitUsd') <> public.landed_cost_snapshot_per_unit(v_total, v_quantity)
         or least(public.landed_cost_snapshot_money(v_sku -> 'freightUsd'), public.landed_cost_snapshot_money(v_sku -> 'dutiesUsd'),
                  public.landed_cost_snapshot_money(v_sku -> 'mpfUsd'), public.landed_cost_snapshot_money(v_sku -> 'hmfUsd'),
                  public.landed_cost_snapshot_money(v_sku -> 'otherUsd')) < 0 then
        raise exception 'A SKU''s amounts don''t add up.' using errcode = '23514';
      end if;
    end loop;

    select sum(public.landed_cost_snapshot_count(s -> 'quantity')) as units,
           sum(public.landed_cost_snapshot_money(s -> 'productUsd')) as product,
           sum(public.landed_cost_snapshot_money(s -> 'freightUsd')) as freight,
           sum(public.landed_cost_snapshot_money(s -> 'mpfUsd')) as mpf,
           sum(public.landed_cost_snapshot_money(s -> 'hmfUsd')) as hmf,
           sum(public.landed_cost_snapshot_money(s -> 'otherUsd')) as other,
           sum(public.landed_cost_snapshot_money(s -> 'totalUsd')) as total
      into v_sum
      from jsonb_array_elements(v_origin -> 'skus') s;
    v_units := public.landed_cost_snapshot_count(v_origin -> 'units');
    v_total := public.landed_cost_snapshot_money(v_origin -> 'totalUsd');
    if v_units <> v_sum.units or v_total <> v_sum.total
       or public.landed_cost_snapshot_money(v_origin -> 'perUnitUsd') <> public.landed_cost_snapshot_per_unit(v_total, v_units)
       or v_sum.freight is distinct from v_scenario.freight_total_usd
       or public.landed_cost_snapshot_money(v_origin -> 'entryFees' -> 'enteredValueUsd') <> v_sum.product
       or public.landed_cost_snapshot_money(v_origin -> 'entryFees' -> 'mpf' -> 'usd') <> v_sum.mpf
       or (case when jsonb_typeof(v_origin -> 'entryFees' -> 'hmf') = 'object'
                then public.landed_cost_snapshot_money(v_origin -> 'entryFees' -> 'hmf' -> 'usd') else 0 end) <> v_sum.hmf
       or v_sum.other <> coalesce((select sum(public.landed_cost_snapshot_money(c -> 'amountUsd'))
                                   from jsonb_array_elements(v_origin -> 'otherCosts') c), 0)
       or v_sum.other <> coalesce((select sum(c.amount_usd) from public.landed_cost_other_costs c where c.scenario_id = v_scenario.id), 0) then
      raise exception 'An origin''s amounts don''t add up.' using errcode = '23514';
    end if;
  end loop;

  -- ---- The comparison: the same origins and totals; drivers add up ----
  select o into v_baseline from jsonb_array_elements(v_origins) o where (o ->> 'isBaseline')::boolean;
  if v_baseline is null or (select count(*) from jsonb_array_elements(v_origins) o where (o ->> 'isBaseline')::boolean) <> 1 then
    raise exception 'The version has no baseline origin.' using errcode = '23514';
  end if;
  v_baseline_total := public.landed_cost_snapshot_money(v_baseline -> 'totalUsd');
  if jsonb_typeof(v_result -> 'comparison') = 'object' then
    if (v_result -> 'comparison' ->> 'baselineId')::uuid is distinct from v_ws.baseline_scenario_id
       or jsonb_array_length(v_result -> 'comparison' -> 'results') <> jsonb_array_length(v_origins) then
      raise exception 'The comparison doesn''t match the origins.' using errcode = '23514';
    end if;
    for v_compared in select * from jsonb_array_elements(v_result -> 'comparison' -> 'results') loop
      select o into v_origin from jsonb_array_elements(v_origins) o where o ->> 'scenarioId' = v_compared ->> 'id';
      if v_origin is null
         or public.landed_cost_snapshot_money(v_compared -> 'totalUsd') <> public.landed_cost_snapshot_money(v_origin -> 'totalUsd')
         or (jsonb_typeof(v_compared -> 'comparable') = 'boolean' and (v_compared ->> 'comparable')::boolean
             and (public.landed_cost_snapshot_money(v_compared -> 'differenceUsd')
                    <> v_baseline_total - public.landed_cost_snapshot_money(v_origin -> 'totalUsd')
                  or coalesce(jsonb_typeof(v_compared -> 'drivers'), '') <> 'array'
                  or public.landed_cost_snapshot_money(v_compared -> 'differenceUsd')
                    <> coalesce((select sum(public.landed_cost_snapshot_money(d -> 'differenceUsd'))
                                 from jsonb_array_elements(v_compared -> 'drivers') d), 0))) then
        raise exception 'The comparison doesn''t add up.' using errcode = '23514';
      end if;
      v_origin := null;
    end loop;
  elsif jsonb_typeof(v_result -> 'comparison') is distinct from 'null' then
    raise exception 'The version has a field that can''t be set.' using errcode = 'LC422';
  end if;

  -- ---- The summary columns match the result ----
  if (p_row ->> 'origin_count')::integer is distinct from jsonb_array_length(v_origins)
     or p_row ->> 'baseline_label' is distinct from v_baseline ->> 'label'
     or public.landed_cost_snapshot_money(p_row -> 'baseline_per_unit_usd')
          <> public.landed_cost_snapshot_money(v_baseline -> 'perUnitUsd')
     or (p_row ->> 'incomplete')::boolean is distinct from
          (select bool_or((o -> 'status' ->> 'incomplete')::boolean) from jsonb_array_elements(v_origins) o) then
    raise exception 'The summary doesn''t match the result.' using errcode = '23514';
  end if;

  -- ---- Insert: the next version number from the counter, explicit columns only ----
  -- Under the workspace lock above. A number is never used twice, even after
  -- its version is deleted; a workspace without a counter row starts from its
  -- highest existing version.
  insert into public.landed_cost_snapshot_counters as c (workspace_id, last_version_no)
  values (v_ws.id, coalesce((select max(s.version_no) from public.landed_cost_snapshots s where s.workspace_id = v_ws.id), 0) + 1)
  on conflict (workspace_id) do update
    set last_version_no = greatest(c.last_version_no,
          coalesce((select max(s.version_no) from public.landed_cost_snapshots s where s.workspace_id = v_ws.id), 0)) + 1
  returning c.last_version_no into v_version;
  insert into public.landed_cost_snapshots (
    workspace_id, version_no, created_by, as_of_date, workspace_name, entry_date, workspace_updated_at,
    hts_release_id, hts_release_name, hts_release_title, hts_release_start_date, schema_version, inputs, result,
    origin_count, baseline_label, baseline_per_unit_usd, incomplete
  ) values (
    v_ws.id, v_version, p_user_id, v_as_of, v_ws.name, v_ws.entry_date, v_ws.updated_at,
    v_release.id, v_release.name, v_release.title, v_release.release_start_date, (p_row ->> 'schema_version')::integer,
    v_inputs, v_result, jsonb_array_length(v_origins), v_baseline ->> 'label',
    public.landed_cost_snapshot_money(p_row -> 'baseline_per_unit_usd'), (p_row ->> 'incomplete')::boolean
  )
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'version_no', v_version);
end;
$$;

-- As in 20261021074001 (create or replace keeps them; restated).
revoke all on function public.save_landed_cost_snapshot(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_landed_cost_snapshot(uuid, jsonb) to service_role;
