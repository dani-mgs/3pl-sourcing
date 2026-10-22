-- Removes the Phase 3a deploy-window compatibility (TECH_DEBT, "Landed Cost:
-- deploy-window compatibility to remove after Phase 3a ships"). The app has
-- sent `overrides` on every item and schema version 2 on every lock since 3a.
--
-- Replaced (same signatures and grants):
--   save_landed_cost_draft      an item without `overrides` is refused with
--                               LC426 ("This page is out of date."), before
--                               anything is written
--   save_landed_cost_snapshot   only schema_version 2 is accepted; version 1
--                               is refused with LC426
-- Not changed: the snapshots' schema_version check stays in (1, 2), so stored
-- version 1 rows stay valid and readable.


-- ---- save_landed_cost_draft ---------------------------------------------------------------
--
-- As in 20261021135010, except that every item must carry `overrides`:
--   [{ ref, id?, kind, layer_key, label, rate_percent, amount_usd, reason, engine_rate_text,
--      engine_amount_usd, sort_order }]
-- An item without the key (a page from before manual rates) is refused
-- with LC426 before anything is written.
-- (a ref unique in the payload). Returns { updated_at, sku_lines, scenarios,
-- overrides: {ref: id} }.

create or replace function public.save_landed_cost_draft(p_workspace_id uuid, p_expected_updated_at timestamptz, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_top constant text[] := array['name', 'entry_date', 'baseline_ref', 'sku_lines', 'scenarios'];
  v_line_keys constant text[] := array[
    'ref', 'id', 'sku_code', 'description', 'hts_code', 'quantity', 'duty_quantity', 'duty_quantity_unit', 'sort_order'
  ];
  v_scenario_keys constant text[] := array[
    'ref', 'id', 'label', 'origin_country', 'supplier_name', 'incoterm', 'shipment_mode', 'entry_type',
    'freight_total_usd', 'freight_basis', 'volumetric_divisor', 'sort_order', 'items', 'other_costs'
  ];
  v_item_keys constant text[] := array[
    'sku_ref', 'fob_unit_price_usd', 'pcs_per_carton', 'carton_length_cm', 'carton_width_cm', 'carton_height_cm',
    'carton_gross_kg', 'overrides'
  ];
  v_override_keys constant text[] := array[
    'ref', 'id', 'kind', 'layer_key', 'label', 'rate_percent', 'amount_usd', 'reason', 'engine_rate_text',
    'engine_amount_usd', 'sort_order'
  ];
  v_cost_keys constant text[] := array['id', 'label', 'amount_usd', 'sort_order'];
  v_lines jsonb := p_payload -> 'sku_lines';
  v_scenarios jsonb := p_payload -> 'scenarios';
  v_current timestamptz;
  v_updated_at timestamptz;
  v_line jsonb;
  v_scenario jsonb;
  v_item jsonb;
  v_cost jsonb;
  v_override jsonb;
  v_override_id uuid;
  v_override_ids jsonb := '{}';
  v_id uuid;
  v_scenario_id uuid;
  v_line_ids jsonb := '{}';
  v_scenario_ids jsonb := '{}';
  v_pairs text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Sign in to save the workspace.' using errcode = '42501';
  end if;

  -- ---- Shape (each step relies on the one before) ----
  if not public.landed_cost_keys_ok(p_payload, v_top)
     or coalesce(jsonb_typeof(v_lines), '') <> 'array' or coalesce(jsonb_typeof(v_scenarios), '') <> 'array' then
    raise exception 'The draft isn''t in the expected shape.' using errcode = 'LC422';
  end if;
  if jsonb_array_length(v_scenarios) = 0 then
    raise exception 'A workspace needs at least one scenario.' using errcode = 'LC422';
  end if;
  if exists (select 1 from jsonb_array_elements(v_lines) l where not public.landed_cost_keys_ok(l, v_line_keys))
     or exists (select 1 from jsonb_array_elements(v_scenarios) s
                where not public.landed_cost_keys_ok(s, v_scenario_keys)
                   or coalesce(jsonb_typeof(s -> 'items'), '') <> 'array'
                   or coalesce(jsonb_typeof(s -> 'other_costs'), '') <> 'array') then
    raise exception 'The draft has a field that can''t be set.' using errcode = 'LC422';
  end if;
  if exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i
             where not public.landed_cost_keys_ok(i, v_item_keys))
     or exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'other_costs') c
                where not public.landed_cost_keys_ok(c, v_cost_keys)) then
    raise exception 'The draft has a field that can''t be set.' using errcode = 'LC422';
  end if;
  -- Manual rates: every item lists its full set. An item without the key
  -- comes from a page opened before manual rates existed.
  if exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i
             where not i ? 'overrides') then
    raise exception 'This page is out of date.' using errcode = 'LC426';
  end if;
  if exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i
             where coalesce(jsonb_typeof(i -> 'overrides'), '') <> 'array') then
    raise exception 'The draft has a field that can''t be set.' using errcode = 'LC422';
  end if;
  if exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i,
               jsonb_array_elements(i -> 'overrides') o
             where not public.landed_cost_keys_ok(o, v_override_keys)) then
    raise exception 'The draft has a field that can''t be set.' using errcode = 'LC422';
  end if;
  if exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i,
               jsonb_array_elements(i -> 'overrides') o
             group by o ->> 'ref' having count(*) > 1 or coalesce(o ->> 'ref', '') = '')
     or exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i,
                  jsonb_array_elements(i -> 'overrides') o
                where o ->> 'id' is not null group by o ->> 'id' having count(*) > 1) then
    raise exception 'The draft''s rows don''t match up.' using errcode = 'LC422';
  end if;
  -- Refs present and unique; ids unique; every item's SKU ref and the
  -- baseline ref resolve; at most one item per SKU line in a scenario.
  if exists (select 1 from jsonb_array_elements(v_lines) l group by l ->> 'ref'
             having count(*) > 1 or coalesce(l ->> 'ref', '') = '')
     or exists (select 1 from jsonb_array_elements(v_scenarios) s group by s ->> 'ref'
                having count(*) > 1 or coalesce(s ->> 'ref', '') = '')
     or exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'id' is not null
                group by l ->> 'id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(v_scenarios) s where s ->> 'id' is not null
                group by s ->> 'id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'other_costs') c
                where c ->> 'id' is not null group by c ->> 'id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i
                where not exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'ref' = i ->> 'sku_ref'))
     or exists (select 1 from jsonb_array_elements(v_scenarios) s, jsonb_array_elements(s -> 'items') i
                group by s ->> 'ref', i ->> 'sku_ref' having count(*) > 1)
     or not exists (select 1 from jsonb_array_elements(v_scenarios) s where s ->> 'ref' = p_payload ->> 'baseline_ref') then
    raise exception 'The draft''s rows don''t match up.' using errcode = 'LC422';
  end if;

  -- ---- The workspace: exists, is the caller's to edit, and is unchanged ----
  -- Any staff member can read it; locking it needs the update policy (owner
  -- or admin). The lock makes a second save wait, then see the new updated_at.
  perform 1 from public.landed_cost_workspaces w where w.id = p_workspace_id;
  if not found then
    raise exception 'This workspace doesn''t exist.' using errcode = 'P0002';
  end if;
  select w.updated_at into v_current from public.landed_cost_workspaces w where w.id = p_workspace_id for update;
  if not found then
    raise exception 'Only the workspace''s owner or an admin can edit it.' using errcode = '42501';
  end if;
  if v_current is distinct from p_expected_updated_at then
    raise exception 'This workspace was changed since you opened it.' using errcode = 'LC409';
  end if;

  -- ---- Rows left out of the draft are deleted first (the 2b row limits count what remains) ----
  delete from public.landed_cost_other_costs c
  where c.workspace_id = p_workspace_id
    and c.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(v_scenarios) s,
                       jsonb_array_elements(s -> 'other_costs') x where x ->> 'id' is not null);
  delete from public.landed_cost_scenarios sc
  where sc.workspace_id = p_workspace_id
    and sc.id not in (select (s ->> 'id')::uuid from jsonb_array_elements(v_scenarios) s where s ->> 'id' is not null);
  delete from public.landed_cost_sku_lines sl
  where sl.workspace_id = p_workspace_id
    and sl.id not in (select (l ->> 'id')::uuid from jsonb_array_elements(v_lines) l where l ->> 'id' is not null);

  -- A SKU line's new quantity is checked against its items' FOB prices, and an
  -- item's new price against the line's quantity, each as it is written. So
  -- that only the final pair is checked, the prices of lines whose quantity
  -- changes are cleared first; the items below write them back.
  update public.landed_cost_scenario_items i
  set fob_unit_price_usd = null
  from public.landed_cost_sku_lines sl, jsonb_array_elements(v_lines) l
  where i.workspace_id = p_workspace_id and i.fob_unit_price_usd is not null
    and sl.id = i.sku_line_id and l ->> 'id' = sl.id::text
    and sl.quantity is distinct from (l ->> 'quantity')::bigint;

  set constraints public.landed_cost_sku_lines_sku_code_unique, public.landed_cost_scenarios_label_unique,
    public.landed_cost_rate_overrides_layer_unique deferred;

  -- ---- SKU lines ----
  for v_line in select x.value from jsonb_array_elements(v_lines) x loop
    if v_line ->> 'id' is not null then
      update public.landed_cost_sku_lines sl set
        sku_code = v_line ->> 'sku_code',
        description = v_line ->> 'description',
        hts_code = v_line ->> 'hts_code',
        quantity = (v_line ->> 'quantity')::bigint,
        duty_quantity = (v_line ->> 'duty_quantity')::numeric,
        duty_quantity_unit = v_line ->> 'duty_quantity_unit',
        sort_order = (v_line ->> 'sort_order')::integer
      where sl.id = (v_line ->> 'id')::uuid and sl.workspace_id = p_workspace_id
      returning sl.id into v_id;
      if not found then
        raise exception 'A SKU line in the draft isn''t in this workspace.' using errcode = 'LC422';
      end if;
    else
      insert into public.landed_cost_sku_lines (
        workspace_id, sku_code, description, hts_code, quantity, duty_quantity, duty_quantity_unit, sort_order
      ) values (
        p_workspace_id, v_line ->> 'sku_code', v_line ->> 'description', v_line ->> 'hts_code',
        (v_line ->> 'quantity')::bigint, (v_line ->> 'duty_quantity')::numeric, v_line ->> 'duty_quantity_unit',
        (v_line ->> 'sort_order')::integer
      )
      returning id into v_id;
    end if;
    v_line_ids := v_line_ids || jsonb_build_object(v_line ->> 'ref', v_id);
  end loop;

  -- ---- Scenarios, with their items and other costs ----
  for v_scenario in select x.value from jsonb_array_elements(v_scenarios) x loop
    if v_scenario ->> 'id' is not null then
      update public.landed_cost_scenarios sc set
        label = v_scenario ->> 'label',
        origin_country = v_scenario ->> 'origin_country',
        supplier_name = v_scenario ->> 'supplier_name',
        incoterm = v_scenario ->> 'incoterm',
        shipment_mode = v_scenario ->> 'shipment_mode',
        entry_type = v_scenario ->> 'entry_type',
        freight_total_usd = (v_scenario ->> 'freight_total_usd')::numeric,
        freight_basis = v_scenario ->> 'freight_basis',
        volumetric_divisor = (v_scenario ->> 'volumetric_divisor')::numeric,
        sort_order = (v_scenario ->> 'sort_order')::integer
      where sc.id = (v_scenario ->> 'id')::uuid and sc.workspace_id = p_workspace_id
      returning sc.id into v_scenario_id;
      if not found then
        raise exception 'A scenario in the draft isn''t in this workspace.' using errcode = 'LC422';
      end if;
    else
      insert into public.landed_cost_scenarios (
        workspace_id, label, origin_country, supplier_name, incoterm, shipment_mode, entry_type,
        freight_total_usd, freight_basis, volumetric_divisor, sort_order
      ) values (
        p_workspace_id, v_scenario ->> 'label', v_scenario ->> 'origin_country', v_scenario ->> 'supplier_name',
        v_scenario ->> 'incoterm', v_scenario ->> 'shipment_mode', v_scenario ->> 'entry_type',
        (v_scenario ->> 'freight_total_usd')::numeric, v_scenario ->> 'freight_basis',
        (v_scenario ->> 'volumetric_divisor')::numeric, (v_scenario ->> 'sort_order')::integer
      )
      returning id into v_scenario_id;
    end if;
    v_scenario_ids := v_scenario_ids || jsonb_build_object(v_scenario ->> 'ref', v_scenario_id);

    for v_item in select x.value from jsonb_array_elements(v_scenario -> 'items') x loop
      v_id := (v_line_ids ->> (v_item ->> 'sku_ref'))::uuid;
      insert into public.landed_cost_scenario_items (
        workspace_id, scenario_id, sku_line_id, fob_unit_price_usd, pcs_per_carton,
        carton_length_cm, carton_width_cm, carton_height_cm, carton_gross_kg
      ) values (
        p_workspace_id, v_scenario_id, v_id, (v_item ->> 'fob_unit_price_usd')::numeric,
        (v_item ->> 'pcs_per_carton')::bigint, (v_item ->> 'carton_length_cm')::numeric,
        (v_item ->> 'carton_width_cm')::numeric, (v_item ->> 'carton_height_cm')::numeric,
        (v_item ->> 'carton_gross_kg')::numeric
      )
      on conflict (scenario_id, sku_line_id) do update set
        fob_unit_price_usd = excluded.fob_unit_price_usd,
        pcs_per_carton = excluded.pcs_per_carton,
        carton_length_cm = excluded.carton_length_cm,
        carton_width_cm = excluded.carton_width_cm,
        carton_height_cm = excluded.carton_height_cm,
        carton_gross_kg = excluded.carton_gross_kg;
      v_pairs := v_pairs || (v_scenario_id::text || ':' || v_id::text);

      -- The item's manual rates: rows left out are deleted, rows with an id
      -- updated only when something changed (so an unchanged one keeps who
      -- set and changed it, and when), new rows inserted. Who and when are
      -- set by the table's trigger, never here.
      delete from public.landed_cost_rate_overrides r
      where r.workspace_id = p_workspace_id and r.scenario_id = v_scenario_id and r.sku_line_id = v_id
        and r.id::text <> all (array(select o ->> 'id' from jsonb_array_elements(v_item -> 'overrides') o where o ->> 'id' is not null));
      for v_override in select x.value from jsonb_array_elements(v_item -> 'overrides') x loop
        if v_override ->> 'id' is not null then
          v_override_id := (v_override ->> 'id')::uuid;
          perform 1 from public.landed_cost_rate_overrides r
          where r.id = v_override_id and r.workspace_id = p_workspace_id and r.scenario_id = v_scenario_id and r.sku_line_id = v_id;
          if not found then
            raise exception 'A manual rate in the draft isn''t on this SKU and origin.' using errcode = 'LC422';
          end if;
          update public.landed_cost_rate_overrides r set
            kind = v_override ->> 'kind',
            layer_key = v_override ->> 'layer_key',
            label = v_override ->> 'label',
            rate_percent = (v_override ->> 'rate_percent')::numeric,
            amount_usd = (v_override ->> 'amount_usd')::numeric,
            reason = v_override ->> 'reason',
            engine_rate_text = v_override ->> 'engine_rate_text',
            engine_amount_usd = (v_override ->> 'engine_amount_usd')::numeric,
            sort_order = (v_override ->> 'sort_order')::integer
          where r.id = v_override_id
            and (r.kind, r.layer_key, r.label, r.rate_percent, r.amount_usd, r.reason, r.engine_rate_text,
                 r.engine_amount_usd, r.sort_order)
                is distinct from
                (v_override ->> 'kind', v_override ->> 'layer_key', v_override ->> 'label',
                 (v_override ->> 'rate_percent')::numeric, (v_override ->> 'amount_usd')::numeric, v_override ->> 'reason',
                 v_override ->> 'engine_rate_text', (v_override ->> 'engine_amount_usd')::numeric,
                 (v_override ->> 'sort_order')::integer);
        else
          insert into public.landed_cost_rate_overrides (
            workspace_id, scenario_id, sku_line_id, kind, layer_key, label, rate_percent, amount_usd, reason,
            engine_rate_text, engine_amount_usd, sort_order
          ) values (
            p_workspace_id, v_scenario_id, v_id, v_override ->> 'kind', v_override ->> 'layer_key', v_override ->> 'label',
            (v_override ->> 'rate_percent')::numeric, (v_override ->> 'amount_usd')::numeric, v_override ->> 'reason',
            v_override ->> 'engine_rate_text', (v_override ->> 'engine_amount_usd')::numeric,
            (v_override ->> 'sort_order')::integer
          )
          returning id into v_override_id;
        end if;
        v_override_ids := v_override_ids || jsonb_build_object(v_override ->> 'ref', v_override_id);
      end loop;
    end loop;

    for v_cost in select x.value from jsonb_array_elements(v_scenario -> 'other_costs') x loop
      if v_cost ->> 'id' is not null then
        update public.landed_cost_other_costs c set
          label = v_cost ->> 'label',
          amount_usd = (v_cost ->> 'amount_usd')::numeric,
          sort_order = (v_cost ->> 'sort_order')::integer
        where c.id = (v_cost ->> 'id')::uuid and c.scenario_id = v_scenario_id and c.workspace_id = p_workspace_id;
        if not found then
          raise exception 'An other cost in the draft isn''t in this scenario.' using errcode = 'LC422';
        end if;
      else
        insert into public.landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd, sort_order)
        values (p_workspace_id, v_scenario_id, v_cost ->> 'label', (v_cost ->> 'amount_usd')::numeric,
                (v_cost ->> 'sort_order')::integer);
      end if;
    end loop;
  end loop;

  -- Items left out of the draft (their inputs were cleared).
  delete from public.landed_cost_scenario_items i
  where i.workspace_id = p_workspace_id and (i.scenario_id::text || ':' || i.sku_line_id::text) <> all (v_pairs);

  -- A real duplicate SKU code or scenario label fails here, inside the call.
  set constraints public.landed_cost_sku_lines_sku_code_unique, public.landed_cost_scenarios_label_unique,
    public.landed_cost_rate_overrides_layer_unique immediate;

  update public.landed_cost_workspaces w set
    name = p_payload ->> 'name',
    entry_date = (p_payload ->> 'entry_date')::date,
    baseline_scenario_id = (v_scenario_ids ->> (p_payload ->> 'baseline_ref'))::uuid
  where w.id = p_workspace_id
  returning w.updated_at into v_updated_at;

  return jsonb_build_object('updated_at', v_updated_at, 'sku_lines', v_line_ids, 'scenarios', v_scenario_ids,
    'overrides', v_override_ids);
end;
$$;

-- As in 20261021020238 (create or replace keeps them; restated).
revoke all on function public.save_landed_cost_draft(uuid, timestamptz, jsonb) from public, anon, service_role;
grant execute on function public.save_landed_cost_draft(uuid, timestamptz, jsonb) to authenticated;

-- ---- save_landed_cost_snapshot ------------------------------------------------------------
--
-- As in 20261021135010, except that only schema version 2 is accepted: a
-- version 1 row (a page from before manual rates) is refused with LC426.
-- Stored version 1 rows stay valid (the table check is still in (1, 2)).

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
  -- Schema version 2 adds 'overrides' here and 'manual' on duty lines (below).
  v_item_keys text[] := array[
    'skuLineId', 'fobUnitPriceUsd', 'pcsPerCarton', 'cartonLengthCm', 'cartonWidthCm', 'cartonHeightCm', 'cartonGrossKg'];
  v_override_keys constant text[] := array[
    'id', 'kind', 'layerKey', 'label', 'ratePercent', 'amountUsd', 'reason', 'engineRateText', 'engineAmountUsd',
    'sortOrder', 'setBy', 'setAt', 'changedBy', 'changedAt'];
  v_manual_keys constant text[] := array[
    'overrideId', 'kind', 'layerName', 'ratePercent', 'amountUsd', 'reason', 'setByName', 'setAt', 'changedByName',
    'changedAt', 'engineRateText', 'engineAmountUsd', 'note'];
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
  v_estimate_line_keys text[] := array[
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
  v_schema integer;
begin
  -- ---- Who ----
  if p_user_id is null or not public.has_staff_role_user(p_user_id) then
    raise exception 'Only staff can lock a version.' using errcode = '42501';
  end if;

  -- ---- Shape: allow-listed keys at every level the checks read ----
  if not public.landed_cost_keys_ok(p_row, v_top) then
    raise exception 'The version has a field that can''t be set.' using errcode = 'LC422';
  end if;
  -- Version 2 only. Version 1 comes from a page opened before manual rates.
  v_schema := case when jsonb_typeof(p_row -> 'schema_version') = 'number' then (p_row ->> 'schema_version')::numeric end;
  if v_schema = 1 then
    raise exception 'This page is out of date.' using errcode = 'LC426';
  end if;
  if v_schema is distinct from 2 then
    raise exception 'The version has a field that can''t be set.' using errcode = 'LC422';
  end if;
  v_item_keys := v_item_keys || 'overrides'::text;
  v_estimate_line_keys := v_estimate_line_keys || 'manual'::text;
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
  if (
       exists (select 1 from jsonb_array_elements(v_inputs -> 'scenarios') e, jsonb_array_elements(e -> 'items') ei
               where not public.landed_cost_snapshot_list_ok(ei -> 'overrides', v_override_keys))
       or exists (select 1 from jsonb_array_elements(v_origins) o, jsonb_array_elements(o -> 'skus') s,
                    jsonb_array_elements(s -> 'duty' -> 'lines') l
                  where not (coalesce(jsonb_typeof(l -> 'manual'), 'null') = 'null'
                             or public.landed_cost_keys_ok(l -> 'manual', v_manual_keys)))
       or exists (select 1 from jsonb_array_elements(v_origins) o
                  where jsonb_typeof(o -> 'status' -> 'includesManualRate') is distinct from 'boolean')) then
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

  -- ---- Manual rates ----
  -- The same manual rates as the saved workspace, each once.
  if (
       (select count(*) from jsonb_array_elements(v_inputs -> 'scenarios') e, jsonb_array_elements(e -> 'items') ei,
          jsonb_array_elements(ei -> 'overrides') eo)
         <> (select count(*) from public.landed_cost_rate_overrides r where r.workspace_id = v_ws.id)
       or exists (
         select 1 from public.landed_cost_rate_overrides r
         where r.workspace_id = v_ws.id
           and (select count(*) from jsonb_array_elements(v_inputs -> 'scenarios') e, jsonb_array_elements(e -> 'items') ei,
                  jsonb_array_elements(ei -> 'overrides') eo
                where e ->> 'id' = r.scenario_id::text and ei ->> 'skuLineId' = r.sku_line_id::text
                  and eo ->> 'id' = r.id::text and eo ->> 'kind' = r.kind
                  and eo ->> 'layerKey' is not distinct from r.layer_key and eo ->> 'label' is not distinct from r.label
                  and (eo ->> 'ratePercent')::numeric is not distinct from r.rate_percent
                  and (eo ->> 'amountUsd')::numeric is not distinct from r.amount_usd
                  and eo ->> 'reason' = r.reason) <> 1)) then
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
      -- The duties are the sum of the layers listed. The engine lists only
      -- what it counts (base duty, reviewed programs that charge or are
      -- exempt at $0.00); programs it doesn't count are warnings, not lines.
      if public.landed_cost_snapshot_money(v_sku -> 'duty' -> 'dutiesUsd')
           <> coalesce((select sum(public.landed_cost_snapshot_money(l -> 'amountUsd'))
                        from jsonb_array_elements(v_sku -> 'duty' -> 'lines') l), 0) then
        raise exception 'A SKU''s duty layers don''t add up.' using errcode = '23514';
      end if;
      -- Each manual layer is one of this SKU's live manual rates in this
      -- origin, at its amount (a rate of the entered value, half up to the
      -- cent, or the fixed amount); each live manual rate is listed once.
      if exists (
           select 1 from jsonb_array_elements(v_sku -> 'duty' -> 'lines') l
           where jsonb_typeof(l -> 'manual') = 'object'
             and not exists (
               select 1 from public.landed_cost_rate_overrides r
               where r.id::text = l -> 'manual' ->> 'overrideId' and r.scenario_id = v_scenario.id
                 and r.sku_line_id::text = v_sku ->> 'skuLineId' and r.kind = l -> 'manual' ->> 'kind'
                 and public.landed_cost_snapshot_money(l -> 'amountUsd')
                       = coalesce(r.amount_usd, round(r.rate_percent * round(v_quantity * v_fob, 2) / 100, 2))))
         or exists (
           select 1 from public.landed_cost_rate_overrides r
           where r.scenario_id = v_scenario.id and r.sku_line_id::text = v_sku ->> 'skuLineId'
             and (select count(*) from jsonb_array_elements(v_sku -> 'duty' -> 'lines') l
                  where jsonb_typeof(l -> 'manual') = 'object' and l -> 'manual' ->> 'overrideId' = r.id::text) <> 1)
         or (select count(*) from jsonb_array_elements(v_sku -> 'duty' -> 'lines') l where jsonb_typeof(l -> 'manual') = 'object')
              <> (select count(*) from public.landed_cost_rate_overrides r
                  where r.scenario_id = v_scenario.id and r.sku_line_id::text = v_sku ->> 'skuLineId') then
        raise exception 'A manual rate doesn''t match the saved workspace.' using errcode = '23514';
      end if;
    end loop;

    -- The origin says it includes a manual rate exactly when it does.
    if (v_origin -> 'status' ->> 'includesManualRate')::boolean is distinct from exists (
         select 1 from jsonb_array_elements(v_origin -> 'skus') s, jsonb_array_elements(s -> 'duty' -> 'lines') l
         where jsonb_typeof(l -> 'manual') = 'object') then
      raise exception 'An origin''s manual-rate flag doesn''t match its layers.' using errcode = '23514';
    end if;

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
    v_release.id, v_release.name, v_release.title, v_release.release_start_date, v_schema,
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
