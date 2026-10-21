-- Landed Cost draft saving (Phase 2c-1): two functions that write a workspace
-- in one transaction, so a draft is saved whole or not at all.
--
--   create_landed_cost_workspace(payload)   a workspace and its first scenario,
--                                           which becomes the baseline
--   save_landed_cost_draft(id, expected updated_at, payload)
--                                           the whole draft: rows with an id are
--                                           updated (ids never change), rows
--                                           without one inserted, rows left out
--                                           deleted
--
-- Both run as the caller (security invoker), so RLS, the column grants and
-- every 2b check and trigger apply exactly as for direct writes: only the
-- workspace's owner or an admin can save it, and any violation rolls the whole
-- call back. Callers are the Landed Cost Server Actions, which parse and
-- normalise the draft first (src/lib/landed-cost/parse-draft.ts; the key lists
-- below are compared with it by workspace-db-sync.test.ts).
--
-- Errors: 42501 not the owner or an admin; P0002 no such workspace; LC409 the
-- workspace changed since it was read (nothing is written); LC422 the payload
-- isn't in the expected shape. Checks and limits raise their 2b codes.
--
-- The two "unique per workspace" constraints become DEFERRABLE INITIALLY
-- IMMEDIATE, so a save can swap two SKU codes or scenario labels: the save
-- defers them, then checks them before it returns. Direct writes still check
-- them at once. Neither is used by a foreign key or as an ON CONFLICT target.

alter table public.landed_cost_sku_lines
  drop constraint landed_cost_sku_lines_sku_code_unique,
  add constraint landed_cost_sku_lines_sku_code_unique unique (workspace_id, sku_code) deferrable initially immediate;
alter table public.landed_cost_scenarios
  drop constraint landed_cost_scenarios_label_unique,
  add constraint landed_cost_scenarios_label_unique unique (workspace_id, label) deferrable initially immediate;

-- An object with no keys outside p_allowed.
create function public.landed_cost_keys_ok(p jsonb, p_allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p) = 'object', false)
    and not exists (select 1 from jsonb_object_keys(p) k where k <> all (p_allowed));
$$;

-- ---- create_landed_cost_workspace ------------------------------------------------------

create function public.create_landed_cost_workspace(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_top constant text[] := array['name', 'entry_date', 'scenario'];
  v_scenario_keys constant text[] := array[
    'label', 'origin_country', 'supplier_name', 'incoterm', 'shipment_mode', 'entry_type',
    'freight_total_usd', 'freight_basis', 'volumetric_divisor'
  ];
  v_scenario jsonb := p_payload -> 'scenario';
  v_workspace_id uuid;
  v_scenario_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a workspace.' using errcode = '42501';
  end if;
  if not public.landed_cost_keys_ok(p_payload, v_top) or not public.landed_cost_keys_ok(v_scenario, v_scenario_keys) then
    raise exception 'The workspace isn''t in the expected shape.' using errcode = 'LC422';
  end if;

  -- owner_id defaults to auth.uid(); the insert policy requires it.
  insert into public.landed_cost_workspaces (name, entry_date)
  values (p_payload ->> 'name', (p_payload ->> 'entry_date')::date)
  returning id into v_workspace_id;

  insert into public.landed_cost_scenarios (
    workspace_id, label, origin_country, supplier_name, incoterm, shipment_mode, entry_type,
    freight_total_usd, freight_basis, volumetric_divisor, sort_order
  ) values (
    v_workspace_id, v_scenario ->> 'label', v_scenario ->> 'origin_country', v_scenario ->> 'supplier_name',
    v_scenario ->> 'incoterm', v_scenario ->> 'shipment_mode', v_scenario ->> 'entry_type',
    (v_scenario ->> 'freight_total_usd')::numeric, v_scenario ->> 'freight_basis',
    (v_scenario ->> 'volumetric_divisor')::numeric, 0
  )
  returning id into v_scenario_id;

  update public.landed_cost_workspaces set baseline_scenario_id = v_scenario_id where id = v_workspace_id;
  return v_workspace_id;
end;
$$;

-- ---- save_landed_cost_draft ------------------------------------------------------------
--
-- Payload (numbers as strings, cast to numeric without rounding):
--   { name, entry_date, baseline_ref,
--     sku_lines: [{ ref, id?, sku_code, description, hts_code, quantity, duty_quantity,
--                   duty_quantity_unit, sort_order }],
--     scenarios: [{ ref, id?, label, origin_country, supplier_name, incoterm, shipment_mode,
--                   entry_type, freight_total_usd, freight_basis, volumetric_divisor, sort_order,
--                   items: [{ sku_ref, fob_unit_price_usd, pcs_per_carton, carton_length_cm,
--                             carton_width_cm, carton_height_cm, carton_gross_kg }],
--                   other_costs: [{ id?, label, amount_usd, sort_order }] }] }
-- A ref is unique in the payload (an existing row's id, or a key the browser
-- made up for a new row); items name their SKU line by ref, and the baseline
-- is a scenario's ref. Returns { updated_at, sku_lines: {ref: id}, scenarios:
-- {ref: id} }.

create function public.save_landed_cost_draft(p_workspace_id uuid, p_expected_updated_at timestamptz, p_payload jsonb)
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
    'carton_gross_kg'
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

  set constraints public.landed_cost_sku_lines_sku_code_unique, public.landed_cost_scenarios_label_unique deferred;

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
  set constraints public.landed_cost_sku_lines_sku_code_unique, public.landed_cost_scenarios_label_unique immediate;

  update public.landed_cost_workspaces w set
    name = p_payload ->> 'name',
    entry_date = (p_payload ->> 'entry_date')::date,
    baseline_scenario_id = (v_scenario_ids ->> (p_payload ->> 'baseline_ref'))::uuid
  where w.id = p_workspace_id
  returning w.updated_at into v_updated_at;

  return jsonb_build_object('updated_at', v_updated_at, 'sku_lines', v_line_ids, 'scenarios', v_scenario_ids);
end;
$$;

-- Callable by signed-in users only (RLS decides what they may write). No
-- service_role grants: nothing uses it here (as 20261021013541).
revoke all on function public.landed_cost_keys_ok(jsonb, text[]) from public, anon, service_role;
revoke all on function public.create_landed_cost_workspace(jsonb) from public, anon, service_role;
revoke all on function public.save_landed_cost_draft(uuid, timestamptz, jsonb) from public, anon, service_role;
grant execute on function public.landed_cost_keys_ok(jsonb, text[]) to authenticated;
grant execute on function public.create_landed_cost_workspace(jsonb) to authenticated;
grant execute on function public.save_landed_cost_draft(uuid, timestamptz, jsonb) to authenticated;
