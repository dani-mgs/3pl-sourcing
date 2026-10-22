-- Landed Cost draft functions (Phase 2c-1): create_landed_cost_workspace and
-- save_landed_cost_draft run as the caller, write everything or nothing,
-- refuse a stale save (compared as timestamptz, to the microsecond), keep row
-- ids stable, refuse removing the last scenario, and let only the owner or an
-- admin save. A client and anon can't use them. Counts only the rows this file
-- creates, so it works on a database with data. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Owner (expert), another expert, an admin, and a client user.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000038a1', 'lc38-owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000038a2', 'lc38-other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000038ad', 'lc38-admin@test.local', '{"role":"admin"}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-0000000038c0', 'pgTAP LC38 Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000038c1', 'lc38-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-0000000038c0"}', '{}');

-- W1 (owner's): SKU-A and SKU-B, scenario China (baseline) with one item on
-- SKU-A at 0.0001 and one other cost. W2 (the other expert's): one of each.
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000380001', '00000000-0000-4000-8000-0000000038a1', 'W1', '2026-11-01'),
  ('00000000-0000-4000-8000-000000380002', '00000000-0000-4000-8000-0000000038a2', 'W2', '2026-11-01');
insert into landed_cost_sku_lines (id, workspace_id, sku_code, hts_code, quantity, sort_order) values
  ('00000000-0000-4000-8000-000000381001', '00000000-0000-4000-8000-000000380001', 'SKU-A', '6402993110', 100, 0),
  ('00000000-0000-4000-8000-000000381002', '00000000-0000-4000-8000-000000380001', 'SKU-B', '6402993110', 10, 1),
  ('00000000-0000-4000-8000-000000382001', '00000000-0000-4000-8000-000000380002', 'SKU-A', '6402993110', 100, 0);
insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode) values
  ('00000000-0000-4000-8000-000000381101', '00000000-0000-4000-8000-000000380001', 'China', 'CN', 'FOB', 'Sea'),
  ('00000000-0000-4000-8000-000000382101', '00000000-0000-4000-8000-000000380002', 'China', 'CN', 'FOB', 'Sea');
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000380001', '00000000-0000-4000-8000-000000381101', '00000000-0000-4000-8000-000000381001', 0.0001);
insert into landed_cost_other_costs (id, workspace_id, scenario_id, label, amount_usd) values
  ('00000000-0000-4000-8000-000000381201', '00000000-0000-4000-8000-000000380001', '00000000-0000-4000-8000-000000381101', 'Broker fee', 95);
-- A known updated_at with microseconds (the trigger would set now()).
alter table landed_cost_workspaces disable trigger landed_cost_workspaces_set_updated_at;
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000381101',
  updated_at = '2026-10-01 01:02:03.123456+00' where id = '00000000-0000-4000-8000-000000380001';
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000382101'
  where id = '00000000-0000-4000-8000-000000380002';
alter table landed_cost_workspaces enable trigger landed_cost_workspaces_set_updated_at;

-- W1's draft as stored, in the payload's shape (refs are the ids).
create function pg_temp.draft() returns jsonb language sql as $$
  select jsonb_build_object(
    'name', w.name, 'entry_date', w.entry_date, 'baseline_ref', w.baseline_scenario_id,
    'sku_lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ref', l.id, 'id', l.id, 'sku_code', l.sku_code, 'description', l.description, 'hts_code', l.hts_code,
        'quantity', l.quantity::text, 'duty_quantity', l.duty_quantity::text, 'duty_quantity_unit', l.duty_quantity_unit,
        'sort_order', l.sort_order) order by l.sort_order, l.sku_code)
      from public.landed_cost_sku_lines l where l.workspace_id = w.id), '[]'),
    'scenarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ref', s.id, 'id', s.id, 'label', s.label, 'origin_country', s.origin_country, 'supplier_name', s.supplier_name,
        'incoterm', s.incoterm, 'shipment_mode', s.shipment_mode, 'entry_type', s.entry_type,
        'freight_total_usd', s.freight_total_usd::text, 'freight_basis', s.freight_basis,
        'volumetric_divisor', s.volumetric_divisor::text, 'sort_order', s.sort_order,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'sku_ref', i.sku_line_id, 'fob_unit_price_usd', i.fob_unit_price_usd::text,
            'pcs_per_carton', i.pcs_per_carton::text, 'carton_length_cm', i.carton_length_cm::text,
            'carton_width_cm', i.carton_width_cm::text, 'carton_height_cm', i.carton_height_cm::text,
            'carton_gross_kg', i.carton_gross_kg::text, 'overrides', '[]'::jsonb) order by i.sku_line_id)
          from public.landed_cost_scenario_items i where i.scenario_id = s.id), '[]'),
        'other_costs', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'amount_usd', c.amount_usd::text,
            'sort_order', c.sort_order) order by c.sort_order, c.label)
          from public.landed_cost_other_costs c where c.scenario_id = s.id), '[]')
      ) order by s.sort_order, s.label)
      from public.landed_cost_scenarios s where s.workspace_id = w.id), '[]'))
  from public.landed_cost_workspaces w where w.id = '00000000-0000-4000-8000-000000380001';
$$;

-- Saves W1 as of its current updated_at; keeps the result for result().
create function pg_temp.save(p jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb;
begin
  r := public.save_landed_cost_draft('00000000-0000-4000-8000-000000380001',
    (select updated_at from public.landed_cost_workspaces where id = '00000000-0000-4000-8000-000000380001'), p);
  perform set_config('lc38.result', r::text, true);
  return r;
end $$;
create function pg_temp.result() returns jsonb language sql as $$ select current_setting('lc38.result', true)::jsonb $$;

-- W1's rows per table: SKU lines, scenarios, items, other costs.
create function pg_temp.counts() returns int[] language sql as $$
  select array[
    (select count(*)::int from public.landed_cost_sku_lines where workspace_id = '00000000-0000-4000-8000-000000380001'),
    (select count(*)::int from public.landed_cost_scenarios where workspace_id = '00000000-0000-4000-8000-000000380001'),
    (select count(*)::int from public.landed_cost_scenario_items where workspace_id = '00000000-0000-4000-8000-000000380001'),
    (select count(*)::int from public.landed_cost_other_costs where workspace_id = '00000000-0000-4000-8000-000000380001')];
$$;
-- Every row id of W1, sorted.
create function pg_temp.ids() returns text language sql as $$
  select string_agg(id::text, ',' order by id::text) from (
    select id from public.landed_cost_sku_lines where workspace_id = '00000000-0000-4000-8000-000000380001'
    union all select id from public.landed_cost_scenarios where workspace_id = '00000000-0000-4000-8000-000000380001'
    union all select id from public.landed_cost_other_costs where workspace_id = '00000000-0000-4000-8000-000000380001') x;
$$;
create function pg_temp.w1(col text) returns text language plpgsql as $$
declare
  v text;
begin
  execute format('select %I::text from public.landed_cost_workspaces where id = %L', col, '00000000-0000-4000-8000-000000380001') into v;
  return v;
end $$;
-- A draft as a page from before manual rates sent it: no `overrides` on any item.
create function pg_temp.old_style(d jsonb) returns jsonb language sql as $$
  select jsonb_set(d, '{scenarios}', (
    select jsonb_agg(s || jsonb_build_object('items', (select coalesce(jsonb_agg(i - 'overrides'), '[]') from jsonb_array_elements(s -> 'items') i)))
    from jsonb_array_elements(d -> 'scenarios') s));
$$;
-- W1 as stored: name, row ids, counts and every item's FOB price.
create function pg_temp.state() returns text language sql as $$
  select pg_temp.w1('name') || '|' || pg_temp.ids() || '|' || array_to_string(pg_temp.counts(), ',') || '|' ||
    coalesce((select string_agg(fob_unit_price_usd::text, ',' order by scenario_id, sku_line_id)
              from public.landed_cost_scenario_items where workspace_id = '00000000-0000-4000-8000-000000380001'), '');
$$;
grant execute on function pg_temp.draft(), pg_temp.save(jsonb), pg_temp.result(), pg_temp.counts(), pg_temp.ids(),
  pg_temp.w1(text), pg_temp.old_style(jsonb), pg_temp.state() to authenticated;

-- ---- Structure ---------------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ',') order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('create_landed_cost_workspace', 'save_landed_cost_draft')),
  array['create_landed_cost_workspace:false:search_path=""', 'save_landed_cost_draft:false:search_path=""'],
  'both functions are security invoker with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.create_landed_cost_workspace(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.save_landed_cost_draft(uuid, timestamptz, jsonb)', 'execute'),
  'signed-in users can call both');
select ok(
  not has_function_privilege('anon', 'public.create_landed_cost_workspace(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.save_landed_cost_draft(uuid, timestamptz, jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.create_landed_cost_workspace(jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.save_landed_cost_draft(uuid, timestamptz, jsonb)', 'execute'),
  'anon and service_role can call neither');
select is(
  (select array_agg(conname::text || ':' || condeferrable || ':' || condeferred order by conname) from pg_constraint
   where conname in ('landed_cost_sku_lines_sku_code_unique', 'landed_cost_scenarios_label_unique')),
  array['landed_cost_scenarios_label_unique:true:false', 'landed_cost_sku_lines_sku_code_unique:true:false'],
  'the per-workspace unique constraints are deferrable, checked at once by default');

-- ---- create_landed_cost_workspace --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000038a1');
select lives_ok(
  $$ select set_config('lc38.created', public.create_landed_cost_workspace('{"name": "pgTAP-38 created", "entry_date": "2026-11-01",
       "scenario": {"label": "China", "origin_country": "CN", "supplier_name": null, "incoterm": "FOB", "shipment_mode": "Sea",
                    "entry_type": "formal", "freight_total_usd": "854.00", "freight_basis": "value", "volumetric_divisor": null}}')::text, true) $$,
  'the owner creates a workspace with its first scenario');
select is(
  (select w.owner_id::text || ':' || (w.baseline_scenario_id = s.id) || ':' || s.label || ':' || s.entry_type || ':' || s.freight_total_usd::text
   from landed_cost_workspaces w join landed_cost_scenarios s on s.workspace_id = w.id
   where w.id = current_setting('lc38.created')::uuid),
  '00000000-0000-4000-8000-0000000038a1:true:China:formal:854.00',
  'the creator owns it, and its only scenario is the baseline');
select is((select count(*)::int from landed_cost_scenarios where workspace_id = current_setting('lc38.created')::uuid), 1,
  'exactly one scenario');
select throws_ok(
  $$ select public.create_landed_cost_workspace('{"name": "pgTAP-38 bad", "entry_date": "2026-11-01",
       "scenario": {"label": "USA", "origin_country": "US", "incoterm": "FOB", "shipment_mode": "Sea",
                    "entry_type": "auto", "freight_basis": "value"}}') $$,
  '23514', null, 'a bad first scenario is refused');
select is((select count(*)::int from landed_cost_workspaces where name = 'pgTAP-38 bad'), 0,
  '... and leaves no workspace behind');
select throws_ok(
  $$ select public.create_landed_cost_workspace('{"name": "pgTAP-38 owner", "entry_date": "2026-11-01",
       "owner_id": "00000000-0000-4000-8000-0000000038a2", "scenario": {}}') $$,
  'LC422', 'The workspace isn''t in the expected shape.', 'an unknown key (owner_id) is refused');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000038c1');
select throws_ok(
  $$ select public.create_landed_cost_workspace('{"name": "pgTAP-38 client", "entry_date": "2026-11-01",
       "scenario": {"label": "China", "origin_country": "CN", "incoterm": "FOB", "shipment_mode": "Sea",
                    "entry_type": "auto", "freight_basis": "value"}}') $$,
  '42501', null, 'a client can''t create one');
reset role;
set local role anon;
select throws_ok($$ select public.create_landed_cost_workspace('{}') $$, '42501', null, 'anon can''t call it');
reset role;

-- ---- Stale saves: compared as timestamptz, to the microsecond -----------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000038a1');
select throws_ok(
  $$ select public.save_landed_cost_draft('00000000-0000-4000-8000-000000380001', '2026-10-01 01:02:03.123455+00',
       jsonb_set(pg_temp.draft(), '{name}', '"Stale"')) $$,
  'LC409', 'This workspace was changed since you opened it.', 'a save 1 microsecond off is refused');
select is(pg_temp.w1('name') || '|' || pg_temp.w1('updated_at'), 'W1|2026-10-01 01:02:03.123456+00',
  '... and changes nothing');
select lives_ok(
  $$ select set_config('lc38.result', public.save_landed_cost_draft('00000000-0000-4000-8000-000000380001',
       '2026-10-01T03:02:03.123456+02:00', pg_temp.draft())::text, true) $$,
  'the same instant written with another offset is accepted');
select is(
  (pg_temp.result() ->> 'updated_at')::timestamptz, now(),
  'the save returns the new updated_at (this transaction''s time)');
select is(pg_temp.w1('updated_at')::timestamptz, now(), '... which is what is stored');
select is(
  array[pg_temp.result() -> 'scenarios' ->> '00000000-0000-4000-8000-000000381101',
        pg_temp.result() -> 'sku_lines' ->> '00000000-0000-4000-8000-000000381002'],
  array['00000000-0000-4000-8000-000000381101', '00000000-0000-4000-8000-000000381002'],
  'existing rows map to their own ids');

-- ---- One save: rename, swap codes, change qty and FOB together, add, remove ----------------
-- SKU-A (qty 100, FOB 0.0001) becomes qty 1 at FOB 1: either change alone
-- would make qty x FOB round to $0.00, so this passes only if the pair is
-- checked as a whole.
select lives_ok(
  $$ select pg_temp.save(jsonb_build_object(
       'name', 'W1 renamed', 'entry_date', '2026-11-02', 'baseline_ref', 'new-S2',
       'sku_lines', jsonb_build_array(
         (pg_temp.draft() -> 'sku_lines' -> 0) || '{"sku_code": "SKU-B", "quantity": "1"}',
         (pg_temp.draft() -> 'sku_lines' -> 1) || '{"sku_code": "SKU-A"}',
         '{"ref": "new-L3", "sku_code": "SKU-C", "description": "New", "hts_code": "8471300100", "quantity": "5",
           "duty_quantity": "1.2345", "duty_quantity_unit": "kg", "sort_order": 2}'::jsonb),
       'scenarios', jsonb_build_array(
         (pg_temp.draft() -> 'scenarios' -> 0) || jsonb_build_object(
           'freight_total_usd', '854.00',
           'items', jsonb_build_array(jsonb_build_object('sku_ref', '00000000-0000-4000-8000-000000381001',
             'fob_unit_price_usd', '1', 'pcs_per_carton', '10', 'carton_length_cm', '40.5', 'carton_width_cm', '30',
             'carton_height_cm', '20', 'carton_gross_kg', '12.345', 'overrides', '[]'::jsonb)),
           'other_costs', '[{"label": "Inland trucking", "amount_usd": "150.00", "sort_order": 0}]'::jsonb),
         jsonb_build_object('ref', 'new-S2', 'label', 'Vietnam', 'origin_country', 'VN', 'incoterm', 'FOB',
           'shipment_mode', 'Air', 'entry_type', 'auto', 'freight_basis', 'units', 'sort_order', 1,
           'items', jsonb_build_array(
             jsonb_build_object('sku_ref', '00000000-0000-4000-8000-000000381001', 'fob_unit_price_usd', '8', 'overrides', '[]'::jsonb),
             '{"sku_ref": "new-L3", "fob_unit_price_usd": "2.5", "overrides": []}'::jsonb),
           'other_costs', '[]'::jsonb)))) $$,
  'the owner saves the whole draft');
select is(pg_temp.counts(), array[3, 2, 3, 1], 'three SKU lines, two scenarios, three items, one other cost');
select is(
  (select string_agg(id::text || '=' || sku_code || '/' || quantity, ',' order by id::text)
   from landed_cost_sku_lines where id in ('00000000-0000-4000-8000-000000381001', '00000000-0000-4000-8000-000000381002')),
  '00000000-0000-4000-8000-000000381001=SKU-B/1,00000000-0000-4000-8000-000000381002=SKU-A/10',
  'the two SKU codes swapped, each line keeping its id');
select is(
  (select fob_unit_price_usd::text || '/' || carton_gross_kg::text from landed_cost_scenario_items
   where scenario_id = '00000000-0000-4000-8000-000000381101' and sku_line_id = '00000000-0000-4000-8000-000000381001'),
  '1/12.345', 'the item has its new FOB price and carton, exactly as sent');
select is(
  (select count(*)::int from landed_cost_other_costs where id = '00000000-0000-4000-8000-000000381201'), 0,
  'the other cost left out was deleted');
select is(pg_temp.w1('baseline_scenario_id'), pg_temp.result() -> 'scenarios' ->> 'new-S2',
  'the baseline is the new scenario, by its ref');
select is(pg_temp.w1('name') || '|' || pg_temp.w1('entry_date'), 'W1 renamed|2026-11-02', 'name and entry date saved');
select is(
  (select duty_quantity::text || ' ' || duty_quantity_unit from landed_cost_sku_lines
   where id = (pg_temp.result() -> 'sku_lines' ->> 'new-L3')::uuid),
  '1.2345 kg', 'the new SKU line has its id in the result');

-- ---- Ids stay stable; swaps of existing labels work --------------------------------------
select set_config('lc38.ids', pg_temp.ids(), true);
select lives_ok(
  $$ select pg_temp.save(jsonb_set(jsonb_set(pg_temp.draft(), '{scenarios,0,label}', '"Vietnam"'),
       '{scenarios,1,label}', '"China"')) $$,
  'two scenario labels swap');
select is(
  (select string_agg(label, ',' order by sort_order) from landed_cost_scenarios
   where workspace_id = '00000000-0000-4000-8000-000000380001'),
  'Vietnam,China', '... and are saved');
select is(pg_temp.ids(), current_setting('lc38.ids'), 'saving the draft back keeps every row id');

-- ---- Everything or nothing ----------------------------------------------------------------
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{sku_lines,1,sku_code}', '"SKU-B"')) $$,
  '23505', null, 'a real duplicate SKU code is refused');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(jsonb_set(jsonb_set(pg_temp.draft(), '{name}', '"Should not stick"'),
       '{sku_lines,0,sku_code}', '"SKU-Z"'), '{scenarios,0,items,0,fob_unit_price_usd}', '"0"')) $$,
  '23514', null, 'one bad row (FOB 0) fails the save');
select is(
  pg_temp.w1('name') || '|' || (select string_agg(sku_code, ',' order by sort_order) from landed_cost_sku_lines
                               where workspace_id = '00000000-0000-4000-8000-000000380001'),
  'W1 renamed|SKU-B,SKU-A,SKU-C', '... and nothing in it was written');
select is(pg_temp.counts(), array[3, 2, 3, 1], '... no row added or removed');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{scenarios}', (pg_temp.draft() -> 'scenarios') || '[
       {"ref": "n1", "label": "N1", "origin_country": "MX", "incoterm": "FOB", "shipment_mode": "Road", "entry_type": "auto", "freight_basis": "units", "sort_order": 2, "items": [], "other_costs": []},
       {"ref": "n2", "label": "N2", "origin_country": "MX", "incoterm": "FOB", "shipment_mode": "Road", "entry_type": "auto", "freight_basis": "units", "sort_order": 3, "items": [], "other_costs": []},
       {"ref": "n3", "label": "N3", "origin_country": "MX", "incoterm": "FOB", "shipment_mode": "Road", "entry_type": "auto", "freight_basis": "units", "sort_order": 4, "items": [], "other_costs": []},
       {"ref": "n4", "label": "N4", "origin_country": "MX", "incoterm": "FOB", "shipment_mode": "Road", "entry_type": "auto", "freight_basis": "units", "sort_order": 5, "items": [], "other_costs": []}]')) $$,
  '23514', 'A workspace can have at most 5 scenarios.', 'the 5-scenario limit applies to a save');

-- ---- Shape and refs -----------------------------------------------------------------------
select throws_ok($$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{scenarios}', '[]')) $$,
  'LC422', 'A workspace needs at least one scenario.', 'removing the last scenario is refused');
select throws_ok($$ select pg_temp.save(pg_temp.draft() || '{"owner_id": "00000000-0000-4000-8000-0000000038a1"}') $$,
  'LC422', 'The draft isn''t in the expected shape.', 'an unknown top-level key is refused');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{scenarios,0,items,0,workspace_id}', '"00000000-0000-4000-8000-000000380002"')) $$,
  'LC422', 'The draft has a field that can''t be set.', 'an unknown item key is refused');
select throws_ok($$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{baseline_ref}', '"nope"')) $$,
  'LC422', 'The draft''s rows don''t match up.', 'a baseline ref that matches no scenario is refused');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{scenarios,0,items}',
       (pg_temp.draft() #> '{scenarios,0,items}') || (pg_temp.draft() #> '{scenarios,0,items,0}'))) $$,
  'LC422', 'The draft''s rows don''t match up.', 'two items for one SKU line in a scenario are refused');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{sku_lines,1,ref}', pg_temp.draft() #> '{sku_lines,0,ref}')) $$,
  'LC422', 'The draft''s rows don''t match up.', 'a ref used twice is refused');
select throws_ok(
  $$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{sku_lines}', (pg_temp.draft() -> 'sku_lines') ||
       '[{"ref": "x", "id": "00000000-0000-4000-8000-000000382001", "sku_code": "SKU-X", "hts_code": "6402993110", "quantity": "1", "sort_order": 9}]')) $$,
  'LC422', 'A SKU line in the draft isn''t in this workspace.', 'another workspace''s row id is refused');

-- ---- A page from before manual rates (no `overrides` on its items) --------------------------
select set_config('lc38.state', pg_temp.state(), true);
select throws_ok(
  $$ select pg_temp.save(pg_temp.old_style(jsonb_set(jsonb_set(pg_temp.draft(), '{name}', '"Old page"'),
       '{scenarios,0,items,0,fob_unit_price_usd}', '"99"'))) $$,
  'LC426', 'This page is out of date.', 'an old-style draft (items without `overrides`) is refused');
select is(pg_temp.state(), current_setting('lc38.state'), '... and nothing in the workspace changed');

-- ---- Removing a scenario (not the last) --------------------------------------------------
select lives_ok(
  $$ select pg_temp.save(jsonb_set(jsonb_set(pg_temp.draft(), '{scenarios}', jsonb_build_array(pg_temp.draft() #> '{scenarios,1}')),
       '{baseline_ref}', pg_temp.draft() #> '{scenarios,1,ref}')) $$,
  'a scenario left out is deleted');
select is(pg_temp.counts(), array[3, 1, 2, 0], '... with its items and other costs');
reset role;

-- ---- Who can save ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000038a2');
select throws_ok($$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{name}', '"Not yours"')) $$,
  '42501', 'Only the workspace''s owner or an admin can edit it.', 'another expert can''t save it');
select is(pg_temp.w1('name'), 'W1 renamed', '... and nothing changed');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000038ad');
select lives_ok($$ select pg_temp.save(jsonb_set(pg_temp.draft(), '{name}', '"Admin renamed"')) $$, 'an admin can save it');
select is(pg_temp.w1('name') || '|' || pg_temp.w1('owner_id'), 'Admin renamed|00000000-0000-4000-8000-0000000038a1',
  '... and the owner stays the same');
reset role;
-- The draft is read as postgres: a client can't read the workspace at all.
select set_config('lc38.draft', pg_temp.draft()::text, true);
select pg_temp.act_as('00000000-0000-4000-8000-0000000038c1');
select throws_ok(
  $$ select public.save_landed_cost_draft('00000000-0000-4000-8000-000000380001', now(), current_setting('lc38.draft')::jsonb) $$,
  'P0002', 'This workspace doesn''t exist.', 'to a client the workspace doesn''t exist');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000038a1');
select throws_ok(
  $$ select public.save_landed_cost_draft('00000000-0000-4000-8000-0000000380ff', now(), current_setting('lc38.draft')::jsonb) $$,
  'P0002', 'This workspace doesn''t exist.', 'a workspace that doesn''t exist');
reset role;
set local role anon;
select throws_ok(
  $$ select public.save_landed_cost_draft('00000000-0000-4000-8000-000000380001', now(), '{}') $$,
  '42501', null, 'anon can''t call it');
reset role;

select * from finish();
rollback;
