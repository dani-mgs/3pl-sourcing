-- Landed Cost locked versions (migration 20261021074001): only the service
-- role can run save_landed_cost_snapshot(); it refuses anyone but staff who
-- own the workspace (or an admin), any field outside its allow-list, a date
-- that isn't today, a release that isn't current, an HTS code not in it, a
-- version of anything but the saved draft as it is now, and amounts that
-- don't add up. Rows can't be updated by anyone, signed-in users can't insert,
-- any staff member reads, the creator, owner or an admin deletes, and a
-- workspace with versions can't be deleted. Counts only the rows this file
-- creates. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Owner (expert), another expert, an admin, a user with no role, and a client user.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000039a1', 'lc39-owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000039a2', 'lc39-other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000039ad', 'lc39-admin@test.local', '{"role":"admin"}', '{}'),
  ('00000000-0000-4000-8000-0000000039a0', 'lc39-norole@test.local', '{}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-0000000039c0', 'pgTAP LC39 Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000039c1', 'lc39-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-0000000039c0"}', '{}');

-- A current release with the SKU's HTS line, and one still importing.
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, title, release_start_date, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000039e301', 'pgTAPLC39', 'Revision 39', '2026-07-01', 'current', 100, 1),
  ('00000000-0000-4000-8000-00000039e302', 'pgTAPLC39b', null, null, 'importing', 3, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description) values
  ('00000000-0000-4000-8000-00000039e301', '6402993160', '64', 3, 'Other'),
  ('00000000-0000-4000-8000-00000039e302', '6402993170', '64', 3, 'Other (importing)');

-- W1 (the owner's): one SKU (100 pcs), China (baseline, FOB 6, freight 854,
-- broker fee 95) and Vietnam (FOB 8, freight 1053).
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000390001', '00000000-0000-4000-8000-0000000039a1', 'LC39', '2026-11-01');
insert into landed_cost_sku_lines (id, workspace_id, sku_code, hts_code, quantity) values
  ('00000000-0000-4000-8000-000000391001', '00000000-0000-4000-8000-000000390001', 'SKU-001', '6402993160', 100);
insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode, entry_type, freight_total_usd, sort_order) values
  ('00000000-0000-4000-8000-000000391101', '00000000-0000-4000-8000-000000390001', 'China', 'CN', 'FOB', 'Sea', 'formal', 854, 0),
  ('00000000-0000-4000-8000-000000391102', '00000000-0000-4000-8000-000000390001', 'Vietnam', 'VN', 'FOB', 'Sea', 'formal', 1053, 1);
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000390001', '00000000-0000-4000-8000-000000391101', '00000000-0000-4000-8000-000000391001', 6),
  ('00000000-0000-4000-8000-000000390001', '00000000-0000-4000-8000-000000391102', '00000000-0000-4000-8000-000000391001', 8);
insert into landed_cost_other_costs (id, workspace_id, scenario_id, label, amount_usd) values
  ('00000000-0000-4000-8000-000000391201', '00000000-0000-4000-8000-000000390001', '00000000-0000-4000-8000-000000391101', 'Broker fee', 95);
alter table landed_cost_workspaces disable trigger landed_cost_workspaces_set_updated_at;
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000391101',
  updated_at = '2026-10-21 01:02:03.123456+00' where id = '00000000-0000-4000-8000-000000390001';
alter table landed_cost_workspaces enable trigger landed_cost_workspaces_set_updated_at;

-- ---- A valid version of W1, as the app builds it ------------------------------------------

create function pg_temp.line(p_kind text, p_amount text) returns jsonb language sql as $$
  select jsonb_build_object('kind', p_kind, 'code', p_kind, 'label', p_kind, 'rateText', '1%', 'amountUsd', p_amount,
    'detail', null, 'sourceLabel', 'HTS', 'sourceUrl', 'https://hts.usitc.gov', 'effectiveFrom', null);
$$;

-- One SKU of an origin: product, freight, duties, MPF, HMF, other.
create function pg_temp.sku(p_product text, p_freight text, p_duties text, p_mpf text, p_hmf text, p_other text, p_total text, p_per_unit text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'skuLineId', '00000000-0000-4000-8000-000000391001', 'quantity', '100',
    'productUsd', p_product, 'freightUsd', p_freight, 'dutiesUsd', p_duties, 'mpfUsd', p_mpf, 'hmfUsd', p_hmf,
    'otherUsd', p_other, 'totalUsd', p_total, 'perUnitUsd', p_per_unit, 'perUnitExact', jsonb_build_object('n', '1', 'd', '1'),
    'duty', jsonb_build_object('htsCode', '6402993160', 'rateColumn', 'general', 'rateText', '6%', 'effectiveDutyRate', '38.4%',
      'incomplete', false, 'dutiesUsd', p_duties, 'lines', jsonb_build_array(pg_temp.line('duty', p_duties)),
      'warnings', '[]'::jsonb, 'dutyReviews', '[]'::jsonb, 'oldestReview', null, 'scheduledChanges', '[]'::jsonb));
$$;

create function pg_temp.origin(p_id text, p_label text, p_baseline boolean, p_sku jsonb, p_total text, p_per_unit text,
  p_entered text, p_mpf text, p_hmf text, p_other_costs jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'scenarioId', p_id, 'label', p_label, 'isBaseline', p_baseline, 'units', '100', 'totalUsd', p_total, 'perUnitUsd', p_per_unit,
    'status', jsonb_build_object('incomplete', false, 'includesManualRate', false, 'unverified', false),
    'entryFees', jsonb_build_object('enteredValueUsd', p_entered, 'entryType', 'formal', 'entryTypeSource', 'chosen',
      'mpf', jsonb_build_object('usd', p_mpf, 'line', pg_temp.line('fee', p_mpf)),
      'hmf', jsonb_build_object('usd', p_hmf, 'line', pg_temp.line('fee', p_hmf)), 'warnings', '[]'::jsonb),
    'otherCosts', p_other_costs, 'skus', jsonb_build_array(p_sku));
$$;

-- W1's saved inputs, read from the tables.
create function pg_temp.inputs() returns jsonb language sql as $$
  select jsonb_build_object(
    'id', w.id, 'ownerId', w.owner_id, 'name', w.name, 'entryDate', w.entry_date, 'currency', w.currency,
    'baselineScenarioId', w.baseline_scenario_id, 'createdAt', w.created_at, 'updatedAt', w.updated_at,
    'skuLines', (select jsonb_agg(jsonb_build_object('id', l.id, 'skuCode', l.sku_code, 'description', l.description,
                   'htsCode', l.hts_code, 'quantity', l.quantity::text, 'dutyQuantity', null))
                 from public.landed_cost_sku_lines l where l.workspace_id = w.id),
    'scenarios', (select jsonb_agg(jsonb_build_object(
        'id', s.id, 'label', s.label, 'originCountry', s.origin_country, 'supplierName', s.supplier_name, 'incoterm', s.incoterm,
        'shipmentMode', s.shipment_mode, 'entryType', s.entry_type, 'freightTotalUsd', s.freight_total_usd::text,
        'freightBasis', s.freight_basis, 'volumetricDivisor', null, 'isBaseline', s.id = w.baseline_scenario_id,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('skuLineId', i.sku_line_id, 'fobUnitPriceUsd', i.fob_unit_price_usd::text,
                    'pcsPerCarton', null, 'cartonLengthCm', null, 'cartonWidthCm', null, 'cartonHeightCm', null, 'cartonGrossKg', null)), '[]')
                  from public.landed_cost_scenario_items i where i.scenario_id = s.id),
        'otherCosts', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'amountUsd', c.amount_usd::text)), '[]')
                       from public.landed_cost_other_costs c where c.scenario_id = s.id)) order by s.sort_order)
      from public.landed_cost_scenarios s where s.workspace_id = w.id))
  from public.landed_cost_workspaces w where w.id = '00000000-0000-4000-8000-000000390001';
$$;

-- China: 600 + 854 + 230.40 + 2.08 + 0.75 + 95 = 1782.23 (17.82/unit).
-- Vietnam: 800 + 1053 + 80 + 2.78 + 1.00 + 0 = 1936.78 (19.37/unit).
-- Vietnam against the baseline: 1782.23 - 1936.78 = -154.55, from drivers
-- -200 (product), -199 (freight), +150.40 (duties), -0.95 (fees), +95 (other).
create function pg_temp.payload() returns jsonb language sql as $$
  select jsonb_build_object(
    'workspace_id', '00000000-0000-4000-8000-000000390001', 'as_of_date', (now() at time zone 'utc')::date,
    'workspace_name', 'LC39', 'entry_date', '2026-11-01', 'workspace_updated_at', '2026-10-21 01:02:03.123456+00',
    'hts_release_name', 'pgTAPLC39', 'hts_release_title', 'Revision 39', 'hts_release_start_date', '2026-07-01',
    'schema_version', 1, 'inputs', pg_temp.inputs(),
    'result', jsonb_build_object(
      'calculatedOn', (now() at time zone 'utc')::date, 'entryDate', '2026-11-01',
      'release', jsonb_build_object('name', 'pgTAPLC39', 'title', 'Revision 39', 'startDate', '2026-07-01'),
      'origins', jsonb_build_array(
        pg_temp.origin('00000000-0000-4000-8000-000000391101', 'China', true,
          pg_temp.sku('600.00', '854.00', '230.40', '2.08', '0.75', '95.00', '1782.23', '17.82'),
          '1782.23', '17.82', '600.00', '2.08', '0.75', '[{"label":"Broker fee","amountUsd":"95.00"}]'),
        pg_temp.origin('00000000-0000-4000-8000-000000391102', 'Vietnam', false,
          pg_temp.sku('800.00', '1053.00', '80.00', '2.78', '1.00', '0.00', '1936.78', '19.37'),
          '1936.78', '19.37', '800.00', '2.78', '1.00', '[]')),
      'comparison', jsonb_build_object('baselineId', '00000000-0000-4000-8000-000000391101', 'caution', '[]'::jsonb,
        'results', jsonb_build_array(
          jsonb_build_object('id', '00000000-0000-4000-8000-000000391101', 'label', 'China', 'isBaseline', true, 'totalUsd', '1782.23',
            'notComparableReasons', '[]'::jsonb, 'modeNote', null, 'comparable', true, 'differenceUsd', '0.00', 'differencePctText', '0.0%',
            'perUnitDifferenceUsd', '0.00', 'vsBaseline', 'Equal to Baseline',
            'drivers', '[{"key":"fob","label":"Product","differenceUsd":"0.00"}]'::jsonb, 'rank', 1, 'rankPosition', 'Lowest Landed Cost'),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000391102', 'label', 'Vietnam', 'isBaseline', false, 'totalUsd', '1936.78',
            'notComparableReasons', '[]'::jsonb, 'modeNote', null, 'comparable', true, 'differenceUsd', '-154.55', 'differencePctText', '-8.7%',
            'perUnitDifferenceUsd', '-1.55', 'vsBaseline', 'Above Baseline',
            'drivers', '[{"key":"fob","label":"Product","differenceUsd":"-200.00"},{"key":"freight","label":"Freight","differenceUsd":"-199.00"},
                         {"key":"duties","label":"Duties","differenceUsd":"150.40"},{"key":"fees","label":"Fees","differenceUsd":"-0.95"},
                         {"key":"other","label":"Other","differenceUsd":"95.00"}]'::jsonb,
            'rank', 2, 'rankPosition', 'Highest Landed Cost'))),
      'comparisonNote', null),
    'origin_count', 2, 'baseline_label', 'China', 'baseline_per_unit_usd', '17.82', 'incomplete', false);
$$;

-- Runs the function as the service role (the only role that may) and goes back.
create function pg_temp.lock(p_user uuid, p_row jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute 'set local role service_role';
  v := public.save_landed_cost_snapshot(p_user, p_row);
  execute 'reset role';
  return v;
exception when others then
  execute 'reset role';
  raise;
end $$;
grant execute on function pg_temp.lock(uuid, jsonb) to service_role;

create function pg_temp.mine() returns bigint language sql as $$
  select count(*) from public.landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001';
$$;
grant execute on function pg_temp.mine() to authenticated;

-- ---- Who can run what -------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'save_landed_cost_snapshot(uuid, jsonb)', 'execute'),
  'the service role can execute save_landed_cost_snapshot');
select ok(not has_function_privilege('anon', 'save_landed_cost_snapshot(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'save_landed_cost_snapshot(uuid, jsonb)', 'execute'),
  'anon and signed-in users cannot execute it (so it is not in pgTAP 32''s user-callable list)');
select ok(not exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.proname = 'save_landed_cost_snapshot' and a.grantee = 0),
  'PUBLIC has no EXECUTE on save_landed_cost_snapshot');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where proname = 'save_landed_cost_snapshot'),
  'it is security definer with an empty search_path');
select ok(not exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.proname in ('landed_cost_snapshot_money', 'landed_cost_snapshot_count', 'landed_cost_snapshot_per_unit',
                        'landed_cost_snapshot_list_ok', 'landed_cost_snapshots_prevent_update')
      and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner),
  'its helpers and the lock trigger can be executed by no API role');
-- The 2c-1 helper (decision A): no change, checked here.
select ok(not has_function_privilege('anon', 'landed_cost_keys_ok(jsonb, text[])', 'execute')
  and not exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.proname = 'landed_cost_keys_ok' and a.grantee = 0),
  'landed_cost_keys_ok: anon and PUBLIC cannot execute it');
select ok(has_function_privilege('authenticated', 'landed_cost_keys_ok(jsonb, text[])', 'execute'),
  'landed_cost_keys_ok: signed-in users can (the security-invoker draft functions call it)');

-- ---- Table privileges -------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'landed_cost_snapshots', 'insert')
  and not has_table_privilege('authenticated', 'landed_cost_snapshots', 'update'),
  'signed-in users have no INSERT or UPDATE');
select ok(has_table_privilege('authenticated', 'landed_cost_snapshots', 'select')
  and has_table_privilege('authenticated', 'landed_cost_snapshots', 'delete'), 'signed-in users have SELECT and DELETE');
select ok(not has_table_privilege('anon', 'landed_cost_snapshots', 'select')
  and not has_table_privilege('service_role', 'landed_cost_snapshots', 'select')
  and not has_table_privilege('service_role', 'landed_cost_snapshots', 'insert'),
  'anon and the service role have no table privileges');

-- ---- Refused: who ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a0', pg_temp.payload()) $$, '42501', 'Only staff can lock a version.',
  'a user with no role is refused');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039c1', pg_temp.payload()) $$, '42501', 'Only staff can lock a version.',
  'a client user is refused');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a2', pg_temp.payload()) $$, '42501', 'Only the workspace''s owner or an admin can lock a version.',
  'another expert (not the owner) is refused');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-000000000000', pg_temp.payload()) $$, '42501', null,
  'an unknown user is refused');

-- ---- Refused: shape ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1', pg_temp.payload() || '{"created_by":"00000000-0000-4000-8000-0000000039a2"}') $$,
  'LC422', null, 'created_by can''t be supplied');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1', pg_temp.payload() || '{"version_no":7}') $$,
  'LC422', null, 'version_no can''t be supplied');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1', pg_temp.payload() || '{"hts_release_id":"00000000-0000-4000-8000-00000039e302"}') $$,
  'LC422', null, 'hts_release_id can''t be supplied');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,extra}', '"x"')) $$, 'LC422', null, 'an unknown key in an origin');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,skus,0,duty,extra}', '"x"')) $$, 'LC422', null, 'an unknown key in a SKU''s duty');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{inputs,scenarios,0,items,0,extra}', '"x"')) $$, 'LC422', null, 'an unknown key in an input item');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,totalUsd}', '1782.23')) $$, 'LC422', null, 'an amount as a JSON number, not a string');

-- ---- Refused: date, release, HTS ---------------------------------------------------------------
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || jsonb_build_object('as_of_date', (now() at time zone 'utc')::date - 2)) $$, '23514', 'The version''s date isn''t today (UTC).',
  'an as-of date two days ago');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || jsonb_build_object('as_of_date', (now() at time zone 'utc')::date + 1)) $$, '23514', 'The version''s date isn''t today (UTC).',
  'an as-of date tomorrow');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload() || '{"hts_release_name":"pgTAPLC39b","hts_release_title":null,"hts_release_start_date":null}',
      '{result,release}', '{"name":"pgTAPLC39b","title":null,"startDate":null}')) $$, '23514', 'The version wasn''t calculated on the current HTS release.', 'a release that isn''t current');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"hts_release_title":"Revision 38"}') $$, '23514', 'The version wasn''t calculated on the current HTS release.', 'the current release with another title');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,1,skus,0,duty,htsCode}', '"6402993170"')) $$, '23514', 'An HTS code isn''t in the current HTS release.',
  'an HTS code that isn''t in the current release');

-- ---- Refused: not the saved draft -------------------------------------------------------------
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"workspace_updated_at":"2026-10-21 01:02:03.123457+00"}') $$, 'LC409', 'The workspace changed since it was calculated.',
  'workspace_updated_at a microsecond off');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{inputs,scenarios,0,items,0,fobUnitPriceUsd}', '"6.01"')) $$, 'LC409', 'The version doesn''t match the saved workspace.',
  'inputs with a FOB price the workspace doesn''t have');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{inputs,skuLines,0,quantity}', '"101"')) $$, 'LC409', 'The version doesn''t match the saved workspace.',
  'inputs with another quantity');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"workspace_name":"Renamed"}') $$, 'LC409', 'The version doesn''t match the saved workspace.', 'another workspace name');

-- ---- Refused: amounts that don't add up -------------------------------------------------------
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,skus,0,totalUsd}', '"1782.24"')) $$, '23514', 'A SKU''s amounts don''t add up.',
  'a SKU total that isn''t the sum of its components');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(jsonb_set(jsonb_set(pg_temp.payload(), '{result,origins,0,skus,0,productUsd}', '"601.00"'),
      '{result,origins,0,skus,0,freightUsd}', '"853.00"'), '{result,origins,0,entryFees,enteredValueUsd}', '"601.00"')) $$, '23514', 'A SKU''s amounts don''t add up.',
  'a product amount that isn''t quantity x the live FOB price');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(jsonb_set(pg_temp.payload(), '{result,origins,0,skus,0,freightUsd}', '"853.00"'),
      '{result,origins,0,skus,0,dutiesUsd}', '"231.40"')) $$, '23514', 'A SKU''s amounts don''t add up.',
  'SKU duties that aren''t the duty''s amount');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(jsonb_set(jsonb_set(pg_temp.payload(), '{result,origins,0,skus,0,freightUsd}', '"853.00"'),
      '{result,origins,0,skus,0,mpfUsd}', '"3.08"'), '{result,origins,0,entryFees,mpf,usd}', '"3.08"')) $$, '23514', 'An origin''s amounts don''t add up.',
  'freight that isn''t the origin''s live freight total');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,totalUsd}', '"1782.22"')) $$, '23514', 'An origin''s amounts don''t add up.',
  'an origin total that isn''t the sum of its SKUs');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,entryFees,mpf,usd}', '"2.09"')) $$, '23514', 'An origin''s amounts don''t add up.',
  'an MPF that isn''t the sum of the SKUs'' MPF');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,otherCosts,0,amountUsd}', '"94.00"')) $$, '23514', 'An origin''s amounts don''t add up.',
  'other costs that aren''t the SKUs'' other costs');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins,0,perUnitUsd}', '"17.83"')) $$, '23514', 'An origin''s amounts don''t add up.',
  'a per-unit cost that isn''t the total / units, half up');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,comparison,results,1,differenceUsd}', '"-154.56"')) $$, '23514', 'The comparison doesn''t add up.',
  'a comparison difference that isn''t baseline minus origin');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,comparison,results,1,drivers,0,differenceUsd}', '"-200.01"')) $$, '23514', 'The comparison doesn''t add up.',
  'drivers that don''t add up to the difference');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"baseline_per_unit_usd":"17.83"}') $$, '23514', 'The summary doesn''t match the result.', 'a summary per-unit cost that isn''t the baseline''s');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"incomplete":true}') $$, '23514', 'The summary doesn''t match the result.', 'an incomplete flag that doesn''t match the origins');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    pg_temp.payload() || '{"origin_count":1}') $$, '23514', 'The summary doesn''t match the result.', 'an origin count that doesn''t match');
select throws_ok($$ select pg_temp.lock('00000000-0000-4000-8000-0000000039a1',
    jsonb_set(pg_temp.payload(), '{result,origins}', (pg_temp.payload() -> 'result' -> 'origins') - 1)) $$, '23514', 'Every origin must be in the version.',
  'a version missing an origin');
select is(pg_temp.mine(), 0::bigint, 'nothing was stored by any refused call');

-- ---- Locked: the owner, then an admin ----------------------------------------------------------
select is((pg_temp.lock('00000000-0000-4000-8000-0000000039a1', pg_temp.payload()) ->> 'version_no')::int, 1,
  'the owner locks v1');
select is((pg_temp.lock('00000000-0000-4000-8000-0000000039ad', pg_temp.payload() ||
    jsonb_build_object('as_of_date', (now() at time zone 'utc')::date - 1,
      'result', jsonb_set(pg_temp.payload() -> 'result', '{calculatedOn}', to_jsonb((now() at time zone 'utc')::date - 1))))
    ->> 'version_no')::int, 2,
  'an admin locks someone else''s workspace as v2 (an as-of date of yesterday is accepted)');
select results_eq(
  $$ select version_no, created_by, hts_release_id, origin_count, baseline_label, baseline_per_unit_usd::text, incomplete
     from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001' order by version_no $$,
  $$ values (1, '00000000-0000-4000-8000-0000000039a1'::uuid, '00000000-0000-4000-8000-00000039e301'::uuid, 2, 'China', '17.82', false),
            (2, '00000000-0000-4000-8000-0000000039ad'::uuid, '00000000-0000-4000-8000-00000039e301'::uuid, 2, 'China', '17.82', false) $$,
  'versions are numbered in turn; created_by is the user given, hts_release_id the current release''s');
select is((select result -> 'origins' -> 0 ->> 'totalUsd' from landed_cost_snapshots
           where workspace_id = '00000000-0000-4000-8000-000000390001' and version_no = 1), '1782.23',
  'amounts are stored as the exact strings sent');

-- ---- Immutable ---------------------------------------------------------------------------------
select throws_ok($$ update landed_cost_snapshots set baseline_label = 'X' where workspace_id = '00000000-0000-4000-8000-000000390001' $$,
  '42501', 'A locked version can''t be changed.', 'the trigger refuses an update by the table''s owner');
set local role service_role;
select throws_ok($$ update landed_cost_snapshots set baseline_label = 'X' where workspace_id = '00000000-0000-4000-8000-000000390001' $$,
  '42501', null, 'the service role can''t update a version');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000039a1');
select throws_ok($$ update landed_cost_snapshots set baseline_label = 'X' $$, '42501', null, 'the owner can''t update a version');
select throws_ok($$ insert into landed_cost_snapshots (workspace_id, version_no, created_by, as_of_date, workspace_name, entry_date,
    workspace_updated_at, hts_release_id, hts_release_name, schema_version, inputs, result, origin_count, baseline_label,
    baseline_per_unit_usd, incomplete) values ('00000000-0000-4000-8000-000000390001', 9, '00000000-0000-4000-8000-0000000039a1',
    current_date, 'LC39', '2026-11-01', now(), '00000000-0000-4000-8000-00000039e301', 'pgTAPLC39', 1, '{}', '{}', 1, 'China', 1, false) $$,
  '42501', null, 'a signed-in user can''t insert a version');

-- ---- Reads ------------------------------------------------------------------------------------
select is(pg_temp.mine(), 2::bigint, 'the owner reads the versions');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039a2');
select is(pg_temp.mine(), 2::bigint, 'another expert reads them too');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039c1');
select is(pg_temp.mine(), 0::bigint, 'a client reads none');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039a0');
select is(pg_temp.mine(), 0::bigint, 'a user with no role reads none');
reset role;
set local role anon;
select throws_ok($$ select count(*) from landed_cost_snapshots $$, '42501', null, 'anon can''t read versions');
reset role;

-- ---- Deletes ----------------------------------------------------------------------------------
-- A version created by the other expert (written as the table's owner, for
-- the creator rule), on W1.
insert into landed_cost_snapshots (workspace_id, version_no, created_by, as_of_date, workspace_name, entry_date, workspace_updated_at,
  hts_release_id, hts_release_name, schema_version, inputs, result, origin_count, baseline_label, baseline_per_unit_usd, incomplete)
select workspace_id, 3, '00000000-0000-4000-8000-0000000039a2', as_of_date, workspace_name, entry_date, workspace_updated_at,
  hts_release_id, hts_release_name, schema_version, inputs, result, origin_count, baseline_label, baseline_per_unit_usd, incomplete
from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001' and version_no = 1;

select pg_temp.act_as('00000000-0000-4000-8000-0000000039a2');
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001' and version_no in (1, 2);
select is(pg_temp.mine(), 3::bigint, 'another expert can''t delete versions they didn''t create');
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001' and version_no = 3;
select is(pg_temp.mine(), 2::bigint, 'the creator deletes their own version');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039c1');
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001';
reset role;
select is(pg_temp.mine(), 2::bigint, 'a client deletes nothing');

select pg_temp.act_as('00000000-0000-4000-8000-0000000039a1');
select throws_ok($$ delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000390001' $$, '23503', null,
  'the workspace can''t be deleted while it has versions');
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001' and version_no = 2;
select is(pg_temp.mine(), 1::bigint, 'the workspace owner deletes a version an admin created');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039ad');
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000390001';
select is(pg_temp.mine(), 0::bigint, 'an admin deletes any version');
select pg_temp.act_as('00000000-0000-4000-8000-0000000039a1');
delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000390001';
reset role;
select is((select count(*) from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000390001'), 0::bigint,
  'with no versions left, the owner deletes the workspace');

select * from finish();
rollback;
