-- Landed Cost workspaces (Phase 2b): any staff member reads; only the
-- workspace's owner or an admin writes it and its child rows; a client and
-- anon get nothing. Owner and key columns can't be updated, rows can't mix
-- two workspaces, and every limit and check refuses bad data. Counts only the
-- rows this file creates, so it works on a database with data. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(119);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Owner (expert), another expert, an admin, and a client user.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000037a1', 'lc-owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000037a2', 'lc-other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000037ad', 'lc-admin@test.local', '{"role":"admin"}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-0000000037c0', 'pgTAP LC Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000037c1', 'lc-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-0000000037c0"}', '{}');

-- W1 (owner's): two SKU lines, two scenarios, one item, one other cost.
-- W2 (the other expert's): one SKU line, one scenario.
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-0000000037a1', 'W1', '2026-11-01'),
  ('00000000-0000-4000-8000-000000370002', '00000000-0000-4000-8000-0000000037a2', 'W2', '2026-11-01');
insert into landed_cost_sku_lines (id, workspace_id, sku_code, hts_code, quantity) values
  ('00000000-0000-4000-8000-000000371001', '00000000-0000-4000-8000-000000370001', 'SKU-1', '6402993110', 100),
  ('00000000-0000-4000-8000-000000371002', '00000000-0000-4000-8000-000000370001', 'SKU-ONE', '8471300100', 1),
  ('00000000-0000-4000-8000-000000372001', '00000000-0000-4000-8000-000000370002', 'SKU-1', '6402993110', 100);
insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode) values
  ('00000000-0000-4000-8000-000000371101', '00000000-0000-4000-8000-000000370001', 'China', 'CN', 'FOB', 'Sea'),
  ('00000000-0000-4000-8000-000000371102', '00000000-0000-4000-8000-000000370001', 'Vietnam', 'VN', 'FOB', 'Sea'),
  ('00000000-0000-4000-8000-000000372101', '00000000-0000-4000-8000-000000370002', 'China', 'CN', 'FOB', 'Sea');
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', '00000000-0000-4000-8000-000000371001', 6);
insert into landed_cost_other_costs (id, workspace_id, scenario_id, label, amount_usd) values
  ('00000000-0000-4000-8000-000000371201', '00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', 'Broker fee', 95);

-- Rows of this file's workspaces, per table, as the current user sees them.
create function pg_temp.mine() returns int[] language sql as $$
  select array[
    (select count(*)::int from public.landed_cost_workspaces where id::text like '00000000-0000-4000-8000-00000037%'),
    (select count(*)::int from public.landed_cost_sku_lines where workspace_id::text like '00000000-0000-4000-8000-00000037%'),
    (select count(*)::int from public.landed_cost_scenarios where workspace_id::text like '00000000-0000-4000-8000-00000037%'),
    (select count(*)::int from public.landed_cost_scenario_items where workspace_id::text like '00000000-0000-4000-8000-00000037%'),
    (select count(*)::int from public.landed_cost_other_costs where workspace_id::text like '00000000-0000-4000-8000-00000037%')];
$$;
grant execute on function pg_temp.mine() to authenticated;

-- ---- Structure ---------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'landed_cost%' and p.prosecdef),
  0, 'no landed cost function is security definer');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'landed_cost%' and c.relkind = 'r' and c.relrowsecurity),
  8, 'all eight tables have RLS (the five workspace tables, the manual rates (pgTAP 40), landed_cost_snapshots and its counter (pgTAP 39))');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'landed_cost%' and grantee = 'service_role'),
  0, 'no service_role privileges on any landed cost table');

-- ---- Any staff member reads ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000037a2');
select is(pg_temp.mine(), array[2, 3, 3, 1, 1], 'another expert reads every workspace and child row');
reset role;

-- ---- The owner writes ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000037a1');
select lives_ok(
  $$ insert into landed_cost_workspaces (id, name, entry_date) values ('00000000-0000-4000-8000-000000370003', 'W3', '2026-11-01') $$,
  'the owner creates a workspace');
select is((select owner_id from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370003'),
  '00000000-0000-4000-8000-0000000037a1'::uuid, 'owned by its creator by default');
select throws_ok(
  $$ insert into landed_cost_workspaces (owner_id, name, entry_date) values ('00000000-0000-4000-8000-0000000037a2', 'For X', '2026-11-01') $$,
  '42501', null, 'not one owned by someone else');
select isnt_empty($$ update landed_cost_workspaces set name = 'W1 renamed' where id = '00000000-0000-4000-8000-000000370001' returning id $$, 'the owner renames it');
select isnt_empty($$ update landed_cost_sku_lines set quantity = 120 where id = '00000000-0000-4000-8000-000000371001' returning id $$, 'updates a SKU line');
select isnt_empty($$ update landed_cost_scenarios set freight_total_usd = 854 where id = '00000000-0000-4000-8000-000000371101' returning id $$, 'a scenario');
select isnt_empty($$ update landed_cost_scenario_items set pcs_per_carton = 20 where scenario_id = '00000000-0000-4000-8000-000000371101' returning sku_line_id $$, 'an item');
select isnt_empty($$ update landed_cost_other_costs set amount_usd = 100 where id = '00000000-0000-4000-8000-000000371201' returning id $$, 'an other cost');
select lives_ok($$ insert into landed_cost_sku_lines (workspace_id, sku_code, hts_code, quantity) values ('00000000-0000-4000-8000-000000370001', 'SKU-2', '6402993110', 5) $$, 'adds a SKU line');
select lives_ok($$ insert into landed_cost_scenarios (workspace_id, label, origin_country, incoterm, shipment_mode) values ('00000000-0000-4000-8000-000000370001', 'Mexico', 'MX', 'EXW', 'Road') $$, 'a scenario');
select lives_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371102', '00000000-0000-4000-8000-000000371001') $$, 'an item (inputs empty for now)');
select lives_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', 'Trucking', 300) $$, 'an other cost');
select isnt_empty($$ update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000371101' where id = '00000000-0000-4000-8000-000000370001' returning id $$, 'sets the baseline');
select throws_ok(
  $$ update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000372101' where id = '00000000-0000-4000-8000-000000370001' $$,
  '23503', null, 'the baseline must be one of the workspace''s own scenarios');
select throws_ok($$ update landed_cost_workspaces set owner_id = '00000000-0000-4000-8000-0000000037a2' where id = '00000000-0000-4000-8000-000000370001' $$,
  '42501', null, 'the owner can''t give the workspace away');
select throws_ok($$ update landed_cost_workspaces set currency = 'EUR' $$, '42501', null, 'nor change the currency');
select throws_ok($$ update landed_cost_sku_lines set workspace_id = '00000000-0000-4000-8000-000000370003' where id = '00000000-0000-4000-8000-000000371001' $$,
  '42501', null, 'nor move a SKU line to another workspace');
select throws_ok($$ update landed_cost_scenario_items set sku_line_id = '00000000-0000-4000-8000-000000371002' $$, '42501', null, 'nor re-key an item');
select isnt_empty($$ delete from landed_cost_other_costs where label = 'Trucking' and workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'deletes an other cost');
select isnt_empty($$ delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370003' returning id $$, 'deletes its own workspace');
reset role;

-- ---- Another expert can't write someone else's workspace ----------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000037a2');
select is_empty($$ update landed_cost_workspaces set name = 'Mine now' where id = '00000000-0000-4000-8000-000000370001' returning id $$, 'another expert can''t rename it');
select is_empty($$ update landed_cost_sku_lines set quantity = 1 where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'nor update its SKU lines');
select is_empty($$ update landed_cost_scenarios set label = 'x' where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'its scenarios');
select is_empty($$ update landed_cost_scenario_items set pcs_per_carton = 1 where workspace_id = '00000000-0000-4000-8000-000000370001' returning sku_line_id $$, 'its items');
select is_empty($$ update landed_cost_other_costs set amount_usd = 1 where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'its other costs');
select is_empty($$ delete from landed_cost_other_costs where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'nor delete its other costs');
select is_empty($$ delete from landed_cost_scenario_items where workspace_id = '00000000-0000-4000-8000-000000370001' returning sku_line_id $$, 'its items');
select is_empty($$ delete from landed_cost_scenarios where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'its scenarios');
select is_empty($$ delete from landed_cost_sku_lines where workspace_id = '00000000-0000-4000-8000-000000370001' returning id $$, 'its SKU lines');
select is_empty($$ delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370001' returning id $$, 'or the workspace');
select throws_ok($$ insert into landed_cost_sku_lines (workspace_id, sku_code, hts_code, quantity) values ('00000000-0000-4000-8000-000000370001', 'X', '6402993110', 1) $$, '42501', null, 'nor add a SKU line to it');
select throws_ok($$ insert into landed_cost_scenarios (workspace_id, label, origin_country, incoterm, shipment_mode) values ('00000000-0000-4000-8000-000000370001', 'X', 'CN', 'FOB', 'Sea') $$, '42501', null, 'a scenario');
select throws_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371102', '00000000-0000-4000-8000-000000371002') $$, '42501', null, 'an item');
select throws_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', 'X', 1) $$, '42501', null, 'an other cost');
select isnt_empty($$ update landed_cost_workspaces set name = 'W2 renamed' where id = '00000000-0000-4000-8000-000000370002' returning id $$, 'but writes its own');
reset role;

-- ---- An admin writes any workspace -------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000037ad');
select isnt_empty($$ update landed_cost_workspaces set name = 'Admin edit' where id = '00000000-0000-4000-8000-000000370001' returning id $$, 'an admin renames someone''s workspace');
select isnt_empty($$ update landed_cost_scenarios set label = 'China (admin)' where id = '00000000-0000-4000-8000-000000371101' returning id $$, 'edits its scenario');
select isnt_empty($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', 'Admin fee', 1) returning id $$, 'adds an other cost');
select isnt_empty($$ delete from landed_cost_other_costs where label = 'Admin fee' returning id $$, 'deletes it');
select throws_ok($$ insert into landed_cost_workspaces (owner_id, name, entry_date) values ('00000000-0000-4000-8000-0000000037a1', 'For owner', '2026-11-01') $$, '42501', null, 'but can''t create one for someone else');
select throws_ok($$ update landed_cost_workspaces set owner_id = '00000000-0000-4000-8000-0000000037ad' where id = '00000000-0000-4000-8000-000000370001' $$, '42501', null, 'nor change its owner');
reset role;

-- ---- A client and anon get nothing --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000037c1');
select is(pg_temp.mine(), array[0, 0, 0, 0, 0], 'a client reads no landed cost rows');
select throws_ok($$ insert into landed_cost_workspaces (name, entry_date) values ('Client', '2026-11-01') $$, '42501', null, 'nor creates a workspace');
select is_empty($$ update landed_cost_workspaces set name = 'x' returning id $$, 'nor updates one');
select is_empty($$ delete from landed_cost_scenarios returning id $$, 'nor deletes anything');
reset role;
set local role anon;
select throws_ok($$ select * from landed_cost_workspaces $$, '42501', null, 'anon is refused');
select throws_ok($$ insert into landed_cost_workspaces (name, entry_date) values ('Anon', '2026-11-01') $$, '42501', null, 'and can''t write');
reset role;

-- ---- No row mixes two workspaces ------------------------------------------------------------
select throws_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371101', '00000000-0000-4000-8000-000000372001') $$,
  '23503', null, 'an item can''t use another workspace''s SKU line');
select throws_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id) values ('00000000-0000-4000-8000-000000370002', '00000000-0000-4000-8000-000000371101', '00000000-0000-4000-8000-000000372001') $$,
  '23503', null, 'nor another workspace''s scenario');
select throws_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370002', '00000000-0000-4000-8000-000000371101', 'X', 1) $$,
  '23503', null, 'nor an other cost');

-- ---- Limits ---------------------------------------------------------------------------------
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000370009', '00000000-0000-4000-8000-0000000037a1', 'Limits', '2026-11-01');
select lives_ok($$ insert into landed_cost_sku_lines (workspace_id, sku_code, hts_code, quantity)
  select '00000000-0000-4000-8000-000000370009', 'SKU-' || n, '6402993110', 1 from generate_series(1, 100) n $$, '100 SKU lines');
select throws_ok($$ insert into landed_cost_sku_lines (workspace_id, sku_code, hts_code, quantity) values ('00000000-0000-4000-8000-000000370009', 'SKU-101', '6402993110', 1) $$,
  '23514', 'A workspace can have at most 100 SKU lines.', 'not 101');
select lives_ok($$ insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode)
  select ('00000000-0000-4000-8000-0000003791' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-4000-8000-000000370009', 'S' || n, 'CN', 'FOB', 'Sea' from generate_series(1, 5) n $$, '5 scenarios');
select throws_ok($$ insert into landed_cost_scenarios (workspace_id, label, origin_country, incoterm, shipment_mode) values ('00000000-0000-4000-8000-000000370009', 'S6', 'CN', 'FOB', 'Sea') $$,
  '23514', 'A workspace can have at most 5 scenarios.', 'not 6');
select lives_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd)
  select '00000000-0000-4000-8000-000000370009', '00000000-0000-4000-8000-000000379101', 'Cost ' || n, 1 from generate_series(1, 20) n $$, '20 other costs on a scenario');
select throws_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370009', '00000000-0000-4000-8000-000000379101', 'Cost 21', 1) $$,
  '23514', 'A scenario can have at most 20 other costs.', 'not 21');
select lives_ok($$ insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values ('00000000-0000-4000-8000-000000370009', '00000000-0000-4000-8000-000000379102', 'Cost 1', 1) $$,
  'the limit is per scenario');

-- ---- Entered value (qty x FOB) as the duty loader accepts it --------------------------------
select throws_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371102', '00000000-0000-4000-8000-000000371002', 0.0049) $$,
  '23514', null, 'qty 1 x $0.0049 rounds to $0.00: refused');
select lives_ok($$ insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values ('00000000-0000-4000-8000-000000370001', '00000000-0000-4000-8000-000000371102', '00000000-0000-4000-8000-000000371002', 0.005) $$,
  'qty 1 x $0.005 rounds to $0.01: accepted');
select throws_ok($$ update landed_cost_scenario_items set fob_unit_price_usd = 999999999999.9999 where sku_line_id = '00000000-0000-4000-8000-000000371001' and scenario_id = '00000000-0000-4000-8000-000000371101' $$,
  '23514', null, 'qty 120 x a huge price reaches $100 trillion: refused');
update landed_cost_scenario_items set fob_unit_price_usd = 200 where sku_line_id = '00000000-0000-4000-8000-000000371001' and scenario_id = '00000000-0000-4000-8000-000000371101';
select throws_ok($$ update landed_cost_sku_lines set quantity = 999999999999 where id = '00000000-0000-4000-8000-000000371001' $$,
  '23514', null, 'a new quantity is checked against the prices too (999,999,999,999 x $200)');
select lives_ok($$ update landed_cost_sku_lines set quantity = 499999999999 where id = '00000000-0000-4000-8000-000000371001' $$,
  'just under $100 trillion is accepted');

-- ---- Check constraints refuse bad data ----------------------------------------------------------
create function pg_temp.ws(p_name text) returns void language sql as $$
  insert into public.landed_cost_workspaces (owner_id, name, entry_date) values ('00000000-0000-4000-8000-0000000037a1', p_name, '2026-11-01');
$$;
select throws_ok($$ select pg_temp.ws('') $$, '23514', null, 'workspace name: empty');
select throws_ok($$ select pg_temp.ws(' W') $$, '23514', null, 'leading space');
select throws_ok($$ select pg_temp.ws(E'W ') $$, '23514', null, 'trailing no-break space (JavaScript trims it)');
select throws_ok($$ select pg_temp.ws(repeat('x', 121)) $$, '23514', null, '121 characters');
select lives_ok($$ select pg_temp.ws(repeat('x', 120)) $$, '120 characters');
select throws_ok($$ select pg_temp.ws(repeat(E'\U0001F600', 61)) $$, '23514', null, '61 emoji are 122 JavaScript characters');
select lives_ok($$ select pg_temp.ws(repeat(E'\U0001F600', 60)) $$, '60 emoji are 120');
select throws_ok($$ insert into landed_cost_workspaces (owner_id, name, entry_date, currency) values ('00000000-0000-4000-8000-0000000037a1', 'EUR', '2026-11-01', 'EUR') $$, '23514', null, 'currency is USD only');

create function pg_temp.sku(p_code text, p_hts text, p_qty bigint, p_dq numeric default null, p_unit text default null, p_desc text default null) returns void language sql as $$
  insert into public.landed_cost_sku_lines (workspace_id, sku_code, hts_code, quantity, duty_quantity, duty_quantity_unit, description)
  values ('00000000-0000-4000-8000-000000370002', p_code, p_hts, p_qty, p_dq, p_unit, p_desc);
$$;
select throws_ok($$ select pg_temp.sku(repeat('S', 61), '6402993110', 1) $$, '23514', null, 'SKU code: 61 characters');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, null, null, '') $$, '23514', null, 'description: empty (store null instead)');
select throws_ok($$ select pg_temp.sku('A', '640299311', 1) $$, '23514', null, 'HTS: 9 digits');
select throws_ok($$ select pg_temp.sku('A', '6402.99.31', 1) $$, '23514', null, 'HTS: not digits only');
select throws_ok($$ select pg_temp.sku('A', '9903880300', 1) $$, '23514', null, 'HTS: chapter 99');
select throws_ok($$ select pg_temp.sku('A', '0012345678', 1) $$, '23514', null, 'HTS: chapter 00');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 0) $$, '23514', null, 'quantity 0');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1000000000000) $$, '23514', null, 'quantity of 13 digits');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, 10, null) $$, '23514', null, 'duty quantity without a unit');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, null, 'kg') $$, '23514', null, 'a unit without a quantity');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, 10, 'pieces') $$, '23514', null, 'an unknown unit');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, 1.12345, 'kg') $$, '23514', null, 'duty quantity with 5 decimals');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1, 0, 'kg') $$, '23514', null, 'duty quantity 0');
select lives_ok($$ select pg_temp.sku('A', '6402993110', 1, 1.1234, 'doz.') $$, 'duty quantity 1.1234 dozen');
select throws_ok($$ select pg_temp.sku('A', '6402993110', 1) $$, '23505', null, 'SKU codes are unique per workspace');

create function pg_temp.scenario(p_label text, p_origin text default 'CN', p_incoterm text default 'FOB', p_mode text default 'Sea',
  p_entry text default 'auto', p_freight numeric default null, p_basis text default 'chargeable_weight', p_divisor numeric default null)
returns void language sql as $$
  insert into public.landed_cost_scenarios (workspace_id, label, origin_country, incoterm, shipment_mode, entry_type, freight_total_usd, freight_basis, volumetric_divisor)
  values ('00000000-0000-4000-8000-000000370002', p_label, p_origin, p_incoterm, p_mode, p_entry, p_freight, p_basis, p_divisor);
$$;
select throws_ok($$ select pg_temp.scenario('China') $$, '23505', null, 'scenario labels are unique per workspace');
select throws_ok($$ select pg_temp.scenario('A', 'US') $$, '23514', null, 'origin: not the US');
select throws_ok($$ select pg_temp.scenario('A', 'ZZ') $$, '23514', null, 'origin: not a country code');
select throws_ok($$ select pg_temp.scenario('A', 'cn') $$, '23514', null, 'origin: upper case');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'CIF') $$, '23514', null, 'incoterm: CIF not yet');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Rail') $$, '23514', null, 'shipment mode');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'informal') $$, '23514', null, 'entry type');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', -1) $$, '23514', null, 'freight negative');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', 1.005) $$, '23514', null, 'freight with 3 decimals (refused, not rounded)');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', 1e12) $$, '23514', null, 'freight of 13 digits');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', null, 'weight') $$, '23514', null, 'freight basis');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', null, 'value', 0) $$, '23514', null, 'divisor 0');
select throws_ok($$ select pg_temp.scenario('A', 'CN', 'FOB', 'Sea', 'auto', null, 'value', 1.2345) $$, '23514', null, 'divisor with 4 decimals');
select lives_ok($$ select pg_temp.scenario('B', 'VN', 'FCA', 'Air', 'formal', 0, 'units', 6000) $$, 'a valid scenario, freight 0');

create function pg_temp.item(p_fob numeric, p_pcs bigint default null, p_len numeric default null, p_kg numeric default null) returns void language sql as $$
  insert into public.landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd, pcs_per_carton, carton_length_cm, carton_gross_kg)
  values ('00000000-0000-4000-8000-000000370002', '00000000-0000-4000-8000-000000372101', '00000000-0000-4000-8000-000000372001', p_fob, p_pcs, p_len, p_kg);
$$;
select throws_ok($$ select pg_temp.item(0) $$, '23514', null, 'FOB 0 (the loader refuses an entered value of 0)');
select throws_ok($$ select pg_temp.item(6.12345) $$, '23514', null, 'FOB with 5 decimals');
select throws_ok($$ select pg_temp.item(6, 0) $$, '23514', null, 'pieces per carton 0');
select throws_ok($$ select pg_temp.item(6, 20, 0) $$, '23514', null, 'carton length 0');
select throws_ok($$ select pg_temp.item(6, 20, 60.005) $$, '23514', null, 'carton length with 3 decimals');
select throws_ok($$ select pg_temp.item(6, 20, 60, 10.0005) $$, '23514', null, 'carton kg with 4 decimals');
select throws_ok($$ select pg_temp.item(6, 20, 1e6) $$, '23514', null, 'carton length of a million cm');

create function pg_temp.cost(p_label text, p_amount numeric) returns void language sql as $$
  insert into public.landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd)
  values ('00000000-0000-4000-8000-000000370002', '00000000-0000-4000-8000-000000372101', p_label, p_amount);
$$;
select throws_ok($$ select pg_temp.cost(repeat('x', 101), 1) $$, '23514', null, 'other cost label: 101 characters');
select throws_ok($$ select pg_temp.cost(' Fee', 1) $$, '23514', null, 'other cost label: untrimmed');
select throws_ok($$ select pg_temp.cost('Fee', -0.01) $$, '23514', null, 'other cost amount negative');
select throws_ok($$ select pg_temp.cost('Fee', 1.001) $$, '23514', null, 'other cost amount with 3 decimals');
select lives_ok($$ select pg_temp.cost('Fee', 0) $$, 'other cost amount 0');

-- ---- Deleting ---------------------------------------------------------------------------------
delete from landed_cost_scenarios where id = '00000000-0000-4000-8000-000000371101';
select is((select baseline_scenario_id from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370001'), null,
  'deleting the baseline scenario clears the baseline');
select is(
  (select count(*)::int from landed_cost_other_costs where scenario_id = '00000000-0000-4000-8000-000000371101')
    + (select count(*)::int from landed_cost_scenario_items where scenario_id = '00000000-0000-4000-8000-000000371101'),
  0, 'and its items and other costs');
delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370001';
select is(
  (select count(*)::int from landed_cost_sku_lines where workspace_id = '00000000-0000-4000-8000-000000370001')
    + (select count(*)::int from landed_cost_scenarios where workspace_id = '00000000-0000-4000-8000-000000370001')
    + (select count(*)::int from landed_cost_scenario_items where workspace_id = '00000000-0000-4000-8000-000000370001')
    + (select count(*)::int from landed_cost_other_costs where workspace_id = '00000000-0000-4000-8000-000000370001'),
  0, 'deleting a workspace deletes its children');
-- A workspace whose baseline is set deletes cleanly too.
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000372101' where id = '00000000-0000-4000-8000-000000370002';
select lives_ok($$ delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000370002' $$, 'with a baseline set');

select * from finish();
rollback;
