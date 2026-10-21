-- Landed Cost manual rate overrides (migration 20261021135010): any staff
-- member reads; the workspace's owner or an admin writes; a client and anon
-- get nothing; who set and changed a row (and when) come from auth.uid(),
-- never from the caller; rows can't mix workspaces; every check refuses bad
-- data; they go with their item. save_landed_cost_draft saves them with the
-- rest of the draft (atomically, ids stable, unchanged rows untouched) and
-- still takes a draft without them (the app before this change).
-- save_landed_cost_snapshot takes schema version 2 with them (re-checking the
-- inputs, each manual amount and the duty sums) and version 1 only while the
-- workspace has none. Counts only the rows this file creates. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Owner (expert), another expert, an admin, and a client user.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000040a1', 'lc40-owner@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000040a2', 'lc40-other@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000040ad', 'lc40-admin@test.local', '{"role":"admin"}', '{}');
insert into clients (id, name) values ('00000000-0000-4000-8000-0000000040c0', 'pgTAP LC40 Client');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000040c1', 'lc40-client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-0000000040c0"}', '{}');

-- W1 (the owner's): one SKU (100 pcs) in China, FOB 6. W2 (the other expert's): the same shape.
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-0000000040a1', 'LC40', '2026-11-01'),
  ('00000000-0000-4000-8000-000000400002', '00000000-0000-4000-8000-0000000040a2', 'LC40 other', '2026-11-01');
insert into landed_cost_sku_lines (id, workspace_id, sku_code, hts_code, quantity) values
  ('00000000-0000-4000-8000-000000401001', '00000000-0000-4000-8000-000000400001', 'SKU-001', '6402993160', 100),
  ('00000000-0000-4000-8000-000000402001', '00000000-0000-4000-8000-000000400002', 'SKU-001', '6402993160', 100);
insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode, entry_type, freight_total_usd) values
  ('00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000400001', 'China', 'CN', 'FOB', 'Sea', 'formal', 854),
  ('00000000-0000-4000-8000-000000402101', '00000000-0000-4000-8000-000000400002', 'China', 'CN', 'FOB', 'Sea', 'formal', 854);
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000401001', 6),
  ('00000000-0000-4000-8000-000000400002', '00000000-0000-4000-8000-000000402101', '00000000-0000-4000-8000-000000402001', 6);
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000401101' where id = '00000000-0000-4000-8000-000000400001';
update landed_cost_workspaces set baseline_scenario_id = '00000000-0000-4000-8000-000000402101' where id = '00000000-0000-4000-8000-000000400002';
-- W2 has a manual rate of its own (for the "not on this item" check).
insert into landed_cost_rate_overrides (workspace_id, scenario_id, sku_line_id, kind, label, amount_usd, reason, set_by, changed_by) values
  ('00000000-0000-4000-8000-000000400002', '00000000-0000-4000-8000-000000402101', '00000000-0000-4000-8000-000000402001',
   'add', 'Anti-dumping', 1, 'x', '00000000-0000-4000-8000-0000000040a2', '00000000-0000-4000-8000-0000000040a2');

-- An override on W1's item, with only the given fields set.
create function pg_temp.ovr(p_kind text, p_layer text, p_label text, p_rate numeric, p_amount numeric, p_reason text default 'Broker ruling',
  p_engine_text text default null, p_engine_amount numeric default null) returns void language sql as $$
  insert into public.landed_cost_rate_overrides (workspace_id, scenario_id, sku_line_id, kind, layer_key, label, rate_percent, amount_usd,
    reason, engine_rate_text, engine_amount_usd)
  values ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000401001',
    p_kind, p_layer, p_label, p_rate, p_amount, p_reason, p_engine_text, p_engine_amount);
$$;
grant execute on function pg_temp.ovr(text, text, text, numeric, numeric, text, text, numeric) to authenticated;

create function pg_temp.mine() returns int language sql as $$
  select count(*)::int from public.landed_cost_rate_overrides where workspace_id = '00000000-0000-4000-8000-000000400001';
$$;
grant execute on function pg_temp.mine() to authenticated;

-- ---- Structure and privileges ---------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.landed_cost_rate_overrides'::regclass), 'RLS is on');
select is(
  (select count(*)::int from pg_policies where tablename = 'landed_cost_rate_overrides' and permissive = 'RESTRICTIVE'
     and cmd = 'ALL' and qual = '( SELECT has_staff_role() AS has_staff_role)'),
  1, 'it has the restrictive staff policy');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'landed_cost_rate_overrides' and grantee in ('anon', 'service_role', 'PUBLIC')),
  0, 'nothing for anon, the service role or PUBLIC');
select ok(
  not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'set_by', 'INSERT')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'set_at', 'INSERT')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'changed_by', 'INSERT')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'changed_by', 'UPDATE')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'set_by', 'UPDATE')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'workspace_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'landed_cost_rate_overrides', 'sku_line_id', 'UPDATE'),
  'signed-in users can''t write who or when, nor re-key a row');
select ok(
  (select not prosecdef from pg_proc where oid = 'public.landed_cost_rate_overrides_audit()'::regprocedure)
    and not exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.proname = 'landed_cost_rate_overrides_audit' and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner),
  'the audit trigger is security invoker and no API role can call it');

-- ---- The owner writes; who and when come from the session --------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000040a1');
select throws_ok(
  $$ insert into landed_cost_rate_overrides (workspace_id, scenario_id, sku_line_id, kind, layer_key, rate_percent, reason,
       engine_rate_text, engine_amount_usd, set_by)
     values ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000401001',
       'replace', 'base', 0, 'x', '3.4%', 20.40, '00000000-0000-4000-8000-0000000040a2') $$,
  '42501', null, 'the caller can''t say who set it');
select lives_ok($$ select pg_temp.ovr('replace', 'base', null, 0, null, 'Ruling NY N123', '3.4%', 20.40) $$, 'the owner sets a manual base rate of 0%');
select is(
  (select array[set_by, changed_by] from landed_cost_rate_overrides where layer_key = 'base' and workspace_id = '00000000-0000-4000-8000-000000400001'),
  array['00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1']::uuid[], 'set and changed by the owner, from auth.uid()');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000040a2');
select is(pg_temp.mine(), 1, 'another expert reads it');
select is_empty($$ update landed_cost_rate_overrides set reason = 'Mine' where workspace_id = '00000000-0000-4000-8000-000000400001' returning id $$,
  'but can''t change it');
select is_empty($$ delete from landed_cost_rate_overrides where workspace_id = '00000000-0000-4000-8000-000000400001' returning id $$, 'nor delete it');
select throws_ok($$ select pg_temp.ovr('add', null, 'Anti-dumping', 10, null) $$, '42501', null, 'nor add one');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000040ad');
select isnt_empty($$ update landed_cost_rate_overrides set reason = 'Ruling NY N124' where layer_key = 'base'
  and workspace_id = '00000000-0000-4000-8000-000000400001' returning id $$, 'an admin changes it');
select is(
  (select array[set_by, changed_by] from landed_cost_rate_overrides where layer_key = 'base' and workspace_id = '00000000-0000-4000-8000-000000400001'),
  array['00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040ad']::uuid[], 'still set by the owner, changed by the admin');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000040a1');
update landed_cost_rate_overrides set reason = reason, sort_order = 1 where layer_key = 'base' and workspace_id = '00000000-0000-4000-8000-000000400001';
select is(
  (select changed_by from landed_cost_rate_overrides where layer_key = 'base' and workspace_id = '00000000-0000-4000-8000-000000400001'),
  '00000000-0000-4000-8000-0000000040ad'::uuid, 'an update that doesn''t change the manual rate keeps who last changed it');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000040c1');
select is(pg_temp.mine(), 0, 'a client reads none');
reset role;
set local role anon;
select throws_ok($$ select * from landed_cost_rate_overrides $$, '42501', null, 'anon is refused');
reset role;

-- ---- Checks -------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into landed_cost_rate_overrides (workspace_id, scenario_id, sku_line_id, kind, label, rate_percent, reason, set_by, changed_by)
     values ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000402101', '00000000-0000-4000-8000-000000402001',
       'add', 'Anti-dumping', 10, 'x', '00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1') $$,
  '23503', null, 'a row can''t point at another workspace''s item');
create function pg_temp.bad(p_kind text, p_layer text, p_label text, p_rate numeric, p_amount numeric, p_reason text,
  p_engine_text text default null, p_engine_amount numeric default null) returns void language sql as $$
  insert into public.landed_cost_rate_overrides (workspace_id, scenario_id, sku_line_id, kind, layer_key, label, rate_percent, amount_usd,
    reason, engine_rate_text, engine_amount_usd, set_by, changed_by)
  values ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000401001',
    p_kind, p_layer, p_label, p_rate, p_amount, p_reason, p_engine_text, p_engine_amount,
    '00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1');
$$;
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 10, 5, 'x') $$, '23514', null, 'a rate and an amount: refused');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', null, null, 'x') $$, '23514', null, 'neither: refused');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 1000.0001, null, 'x') $$, '23514', null, 'a rate above 1000%');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 12.12345, null, 'x') $$, '23514', null, 'a rate with 5 decimals (refused, not rounded)');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', -0.0001, null, 'x') $$, '23514', null, 'a negative rate');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', null, 1.005, 'x') $$, '23514', null, 'an amount with 3 decimals');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', null, -0.01, 'x') $$, '23514', null, 'a negative amount');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 10, null, '') $$, '23514', null, 'an empty reason');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 10, null, ' Ruling') $$, '23514', null, 'an untrimmed reason');
select throws_ok($$ select pg_temp.bad('add', null, 'AD', 10, null, repeat('r', 501)) $$, '23514', null, 'a reason of 501 characters');
select throws_ok($$ select pg_temp.bad('replace', 'mpf', null, 10, null, 'x', '0.3464%', 2.08) $$, '23514', null, 'MPF can''t be overridden');
select throws_ok($$ select pg_temp.bad('add', 'hmf_ocean', 'HMF', 10, null, 'x') $$, '23514', null, 'nor HMF');
select throws_ok($$ select pg_temp.bad('add', 'Section-301', 'S301', 10, null, 'x') $$, '23514', null, 'a layer key that isn''t a program key');
select throws_ok($$ select pg_temp.bad('replace', 'section_301', null, 10, null, 'x') $$, '23514', null, 'a replace without the app''s rate');
select throws_ok($$ select pg_temp.bad('replace', 'section_301', 'S301', 10, null, 'x', '+25%', 150) $$, '23514', null, 'a replace with a label');
select throws_ok($$ select pg_temp.bad('add', null, null, 10, null, 'x') $$, '23514', null, 'an add without a label');
select throws_ok($$ select pg_temp.bad('add', 'base', 'Base', 10, null, 'x') $$, '23514', null, 'an add can''t be the base duty');
select throws_ok($$ select pg_temp.bad('add', null, repeat('L', 101), 10, null, 'x') $$, '23514', null, 'a label of 101 characters');
select throws_ok($$ select pg_temp.bad('replace', 'base', null, 1, null, 'x', '3.4%', 20.40) $$, '23505', null, 'one manual rate per layer');
select lives_ok($$ select pg_temp.bad('add', null, 'Anti-dumping', 1000, null, 'x');
                   select pg_temp.bad('add', null, 'Anti-dumping 2', null, 0, 'x') $$,
  'free-labelled adds (no key) at 1000% and at $0.00 are fine, and more than one');
select lives_ok($$ select pg_temp.bad('add', 'k' || n, 'P' || n, 1, null, 'x') from generate_series(1, 7) n $$, '10 on one item');
select throws_ok($$ select pg_temp.bad('add', 'k8', 'P8', 1, null, 'x') $$, '23514', 'A SKU can have at most 10 manual rates in an origin.', 'not 11');
delete from landed_cost_rate_overrides where workspace_id = '00000000-0000-4000-8000-000000400001' and layer_key is distinct from 'base';

-- ---- save_landed_cost_draft -----------------------------------------------------------------------
-- W1's draft as the app sends it; the item carries `p_overrides` (or no key when null).
create function pg_temp.draft(p_name text, p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'name', p_name, 'entry_date', '2026-11-01', 'baseline_ref', 's1',
    'sku_lines', jsonb_build_array(jsonb_build_object('ref', 'l1', 'id', '00000000-0000-4000-8000-000000401001', 'sku_code', 'SKU-001',
      'description', null, 'hts_code', '6402993160', 'quantity', '100', 'duty_quantity', null, 'duty_quantity_unit', null, 'sort_order', 0)),
    'scenarios', jsonb_build_array(jsonb_build_object('ref', 's1', 'id', '00000000-0000-4000-8000-000000401101', 'label', 'China',
      'origin_country', 'CN', 'supplier_name', null, 'incoterm', 'FOB', 'shipment_mode', 'Sea', 'entry_type', 'formal',
      'freight_total_usd', '854', 'freight_basis', 'chargeable_weight', 'volumetric_divisor', null, 'sort_order', 0,
      'items', jsonb_build_array(jsonb_build_object('sku_ref', 'l1', 'fob_unit_price_usd', '6', 'pcs_per_carton', null,
        'carton_length_cm', null, 'carton_width_cm', null, 'carton_height_cm', null, 'carton_gross_kg', null)
        || case when p_overrides is null then '{}'::jsonb else jsonb_build_object('overrides', p_overrides) end),
      'other_costs', '[]'::jsonb)));
$$;
grant execute on function pg_temp.draft(text, jsonb) to authenticated;
create function pg_temp.save(p_payload jsonb) returns jsonb language sql as $$
  select public.save_landed_cost_draft('00000000-0000-4000-8000-000000400001',
    (select updated_at from public.landed_cost_workspaces where id = '00000000-0000-4000-8000-000000400001'), p_payload);
$$;
grant execute on function pg_temp.save(jsonb) to authenticated;
create function pg_temp.base_row() returns jsonb language sql as $$
  select jsonb_build_object('ref', 'o-base', 'id', r.id, 'kind', r.kind, 'layer_key', r.layer_key, 'label', r.label,
    'rate_percent', r.rate_percent::text, 'amount_usd', r.amount_usd::text, 'reason', r.reason, 'engine_rate_text', r.engine_rate_text,
    'engine_amount_usd', r.engine_amount_usd::text, 'sort_order', r.sort_order)
  from public.landed_cost_rate_overrides r where r.layer_key = 'base' and r.workspace_id = '00000000-0000-4000-8000-000000400001';
$$;
grant execute on function pg_temp.base_row() to authenticated;
create temp table seen as
  select id, set_at, changed_at, updated_at from landed_cost_rate_overrides where workspace_id = '00000000-0000-4000-8000-000000400001';
grant select on seen to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-0000000040a1');
select lives_ok($$ select pg_temp.save(pg_temp.draft('LC40 old app', null)) $$, 'a draft without `overrides` (the app before this change) still saves');
select is(pg_temp.mine(), 1, '...and leaves the item''s manual rates as they are');
select lives_ok($$ select pg_temp.save(pg_temp.draft('LC40', jsonb_build_array(pg_temp.base_row()))) $$, 'the same manual rate sent back unchanged');
select ok(
  (select r.set_at = s.set_at and r.changed_at = s.changed_at and r.updated_at = s.updated_at
   from landed_cost_rate_overrides r join pg_temp.seen s using (id)),
  '...isn''t rewritten: who set and changed it, and when, stay as they were');
select is(
  (select (pg_temp.save(pg_temp.draft('LC40', jsonb_build_array(pg_temp.base_row(),
     jsonb_build_object('ref', 'o-new', 'kind', 'add', 'layer_key', null, 'label', 'Anti-dumping', 'rate_percent', null,
       'amount_usd', '12.34', 'reason', 'Case A-570-001', 'engine_rate_text', null, 'engine_amount_usd', null, 'sort_order', 1)))) -> 'overrides') ?& array['o-base', 'o-new']),
  true, 'a new one is saved with the draft, and the result maps each ref to its id');
select is(
  (select array[set_by::text, changed_by::text] from landed_cost_rate_overrides where label = 'Anti-dumping'
     and workspace_id = '00000000-0000-4000-8000-000000400001'),
  array['00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1'], 'set by the saver, from auth.uid()');
select throws_ok(
  $$ select pg_temp.save(pg_temp.draft('LC40', jsonb_build_array(pg_temp.base_row() || '{"set_by":"00000000-0000-4000-8000-0000000040a2"}'))) $$,
  'LC422', null, 'the draft can''t say who set a manual rate');
select throws_ok(
  $$ select pg_temp.save(pg_temp.draft('LC40 renamed', jsonb_build_array(pg_temp.base_row() || '{"amount_usd":"5.00"}'))) $$,
  '23514', null, 'a manual rate with a rate and an amount fails the whole save...');
select is((select name from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000400001'), 'LC40', '...so nothing else is written');
select throws_ok(
  $$ select pg_temp.save(pg_temp.draft('LC40', jsonb_build_array(pg_temp.base_row() || jsonb_build_object('id', (
       select r.id from landed_cost_rate_overrides r where r.workspace_id = '00000000-0000-4000-8000-000000400002' limit 1))))) $$,
  'LC422', null, 'an id that isn''t on this item is refused');
select lives_ok($$ select pg_temp.save(pg_temp.draft('LC40', '[]'::jsonb)) $$, 'an empty list...');
select is(pg_temp.mine(), 0, '...deletes the item''s manual rates');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000040a2');
select throws_ok($$ select pg_temp.save(pg_temp.draft('LC40', '[]'::jsonb)) $$, '42501', null, 'another expert can''t save the draft');
reset role;

-- ---- Cascade --------------------------------------------------------------------------------------
select pg_temp.ovr('add', null, 'Anti-dumping', 10, null);
delete from landed_cost_scenario_items where scenario_id = '00000000-0000-4000-8000-000000401101';
select is(pg_temp.mine(), 0, 'deleting the item deletes its manual rates');
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101', '00000000-0000-4000-8000-000000401001', 6);

-- ---- save_landed_cost_snapshot --------------------------------------------------------------------
-- W1 locked with two manual rates: Section 301 (China) replaced at 0%, and
-- a free-labelled anti-dumping duty of $12.34. Lines: the base duty 3.4% of
-- $600.00 = $20.40, then the two manual ones; a pending-review program is a
-- warning, not a line, and isn't counted. Duties 20.40 + 0.00 + 12.34 = 32.74.
-- Total 600 + 854 + 32.74 + 34.58 + 0.75 = 1522.07 (15.22/unit).
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, title, release_start_date, status, next_chapter, row_count) values
  ('00000000-0000-4000-8000-00000040e301', 'pgTAPLC40', 'Revision 40', '2026-07-01', 'current', 100, 1);
insert into hts_lines (release_id, hts_code, chapter, indent, description) values
  ('00000000-0000-4000-8000-00000040e301', '6402993160', '64', 3, 'Other');
insert into landed_cost_rate_overrides (id, workspace_id, scenario_id, sku_line_id, kind, layer_key, label, rate_percent, amount_usd, reason,
  engine_rate_text, engine_amount_usd, sort_order, set_by, changed_by) values
  ('00000000-0000-4000-8000-000000401301', '00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101',
   '00000000-0000-4000-8000-000000401001', 'replace', 'section_301', null, 0, null, 'Exclusion granted', '+25%', 150.00, 0,
   '00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1'),
  ('00000000-0000-4000-8000-000000401302', '00000000-0000-4000-8000-000000400001', '00000000-0000-4000-8000-000000401101',
   '00000000-0000-4000-8000-000000401001', 'add', null, 'Anti-dumping', null, 12.34, 'Case A-570-001', null, null, 1,
   '00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-0000000040a1');
alter table landed_cost_workspaces disable trigger landed_cost_workspaces_set_updated_at;
update landed_cost_workspaces set name = 'LC40', updated_at = '2026-10-21 01:02:03.123456+00' where id = '00000000-0000-4000-8000-000000400001';
alter table landed_cost_workspaces enable trigger landed_cost_workspaces_set_updated_at;

create function pg_temp.line(p_kind text, p_code text, p_amount text, p_manual jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('kind', p_kind, 'code', p_code, 'label', p_code, 'rateText', '1%', 'amountUsd', p_amount,
    'detail', null, 'sourceLabel', 'HTS', 'sourceUrl', 'https://hts.usitc.gov', 'effectiveFrom', null)
    || case when p_manual is null then '{}'::jsonb else jsonb_build_object('manual', p_manual) end;
$$;
create function pg_temp.manual(p_id text, p_kind text, p_rate text, p_amount text) returns jsonb language sql as $$
  select jsonb_build_object('overrideId', p_id, 'kind', p_kind, 'layerName', 'x', 'ratePercent', p_rate, 'amountUsd', p_amount,
    'reason', 'x', 'setByName', 'Dani', 'setAt', '2026-10-21T00:00:00Z', 'changedByName', 'Dani', 'changedAt', '2026-10-21T00:00:00Z',
    'engineRateText', null, 'engineAmountUsd', null, 'note', null);
$$;
-- W1's saved inputs; version 2 items carry their manual rates.
create function pg_temp.inputs(p_v2 boolean) returns jsonb language sql as $$
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
                    'pcsPerCarton', null, 'cartonLengthCm', null, 'cartonWidthCm', null, 'cartonHeightCm', null, 'cartonGrossKg', null)
                    || case when p_v2 then jsonb_build_object('overrides', (
                         select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'layerKey', r.layer_key, 'label', r.label,
                           'ratePercent', r.rate_percent::text, 'amountUsd', r.amount_usd::text, 'reason', r.reason,
                           'engineRateText', r.engine_rate_text, 'engineAmountUsd', r.engine_amount_usd::text, 'sortOrder', r.sort_order,
                           'setBy', r.set_by, 'setAt', r.set_at, 'changedBy', r.changed_by, 'changedAt', r.changed_at)), '[]')
                         from public.landed_cost_rate_overrides r where r.scenario_id = i.scenario_id and r.sku_line_id = i.sku_line_id))
                       else '{}'::jsonb end), '[]')
                  from public.landed_cost_scenario_items i where i.scenario_id = s.id),
        'otherCosts', '[]'::jsonb))
      from public.landed_cost_scenarios s where s.workspace_id = w.id))
  from public.landed_cost_workspaces w where w.id = '00000000-0000-4000-8000-000000400001';
$$;
-- The version, with the given duty lines (and the totals they give).
create function pg_temp.row(p_v2 boolean, p_lines jsonb, p_duties text, p_total text, p_per_unit text, p_manual_flag boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'workspace_id', '00000000-0000-4000-8000-000000400001', 'as_of_date', (now() at time zone 'utc')::date,
    'workspace_name', 'LC40', 'entry_date', '2026-11-01', 'workspace_updated_at', '2026-10-21 01:02:03.123456+00',
    'hts_release_name', 'pgTAPLC40', 'hts_release_title', 'Revision 40', 'hts_release_start_date', '2026-07-01',
    'schema_version', case when p_v2 then 2 else 1 end, 'inputs', pg_temp.inputs(p_v2),
    'result', jsonb_build_object(
      'calculatedOn', (now() at time zone 'utc')::date, 'entryDate', '2026-11-01',
      'release', jsonb_build_object('name', 'pgTAPLC40', 'title', 'Revision 40', 'startDate', '2026-07-01'),
      'origins', jsonb_build_array(jsonb_build_object(
        'scenarioId', '00000000-0000-4000-8000-000000401101', 'label', 'China', 'isBaseline', true, 'units', '100',
        'totalUsd', p_total, 'perUnitUsd', p_per_unit,
        'status', jsonb_build_object('incomplete', true, 'includesManualRate', p_manual_flag, 'unverified', false),
        'entryFees', jsonb_build_object('enteredValueUsd', '600.00', 'entryType', 'formal', 'entryTypeSource', 'chosen',
          'mpf', jsonb_build_object('usd', '34.58', 'line', pg_temp.line('fee', 'mpf', '34.58')),
          'hmf', jsonb_build_object('usd', '0.75', 'line', pg_temp.line('fee', 'hmf', '0.75')), 'warnings', '[]'::jsonb),
        'otherCosts', '[]'::jsonb,
        'skus', jsonb_build_array(jsonb_build_object(
          'skuLineId', '00000000-0000-4000-8000-000000401001', 'quantity', '100',
          'productUsd', '600.00', 'freightUsd', '854.00', 'dutiesUsd', p_duties, 'mpfUsd', '34.58', 'hmfUsd', '0.75',
          'otherUsd', '0.00', 'totalUsd', p_total, 'perUnitUsd', p_per_unit, 'perUnitExact', jsonb_build_object('n', '1', 'd', '1'),
          'duty', jsonb_build_object('htsCode', '6402993160', 'rateColumn', 'general', 'rateText', '3.4%', 'effectiveDutyRate', '5.5%',
            'incomplete', true, 'dutiesUsd', p_duties, 'lines', p_lines,
            -- Real-shaped: a program pending review is a warning, not a line, and isn't in the total.
            'warnings', '[{"programKey":"section_301_forced_labor","name":"Section 301 (forced labour)","text":"Duty data is loaded but pending expert review.","sourceLabel":"USTR","sourceUrl":"https://ustr.gov","kind":"pending_review","indicativePct":12.5,"hint":"could add 12.5%","counted":true}]'::jsonb,
            'dutyReviews', '[]'::jsonb, 'oldestReview', null, 'scheduledChanges', '[]'::jsonb))))),
      'comparison', null, 'comparisonNote', null),
    'origin_count', 1, 'baseline_label', 'China', 'baseline_per_unit_usd', p_per_unit, 'incomplete', true);
$$;
create function pg_temp.lines(p_s301 text default '0.00', p_base text default '20.40', p_ad_id text default '00000000-0000-4000-8000-000000401302') returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.line('duty', 'general', p_base, 'null'::jsonb),
    pg_temp.line('additional', 'section_301', p_s301, pg_temp.manual('00000000-0000-4000-8000-000000401301', 'replace', '0', null)),
    pg_temp.line('additional', 'manual', '12.34', pg_temp.manual(p_ad_id, 'add', null, '12.34')));
$$;
create function pg_temp.lock(p_row jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute 'set local role service_role';
  v := public.save_landed_cost_snapshot('00000000-0000-4000-8000-0000000040a1', p_row);
  execute 'reset role';
  return v;
exception when others then
  execute 'reset role';
  raise;
end $$;
grant execute on function pg_temp.lock(jsonb) to service_role;
create function pg_temp.versions() returns int language sql as $$
  select count(*)::int from public.landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000400001';
$$;

select throws_ok($$ select pg_temp.lock(pg_temp.row(false, pg_temp.lines(), '32.74', '1522.07', '15.22', true) - 'x') $$,
  'LC422', null, 'version 1 can''t carry manual layers');
select throws_ok(
  $$ select pg_temp.lock(pg_temp.row(false, jsonb_build_array(pg_temp.line('duty', 'general', '20.40')), '20.40', '1509.73', '15.10', false)) $$,
  'LC409', 'This workspace has manual rates: reload the page and lock again.',
  'a version 1 row (the app before this change) is refused while the workspace has manual rates');
select lives_ok($$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines(), '32.74', '1522.07', '15.22', true)) $$,
  'version 2 with the manual rates locks, a pending-review warning present and not counted');
select is((select schema_version from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000400001'), 2, 'stored as version 2');
select throws_ok($$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines(), '32.74', '1522.07', '15.22', false)) $$,
  '23514', null, 'the origin must say it includes a manual rate');
select throws_ok($$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines('0.00', '20.41'), '32.74', '1522.07', '15.22', true)) $$,
  '23514', 'A SKU''s duty layers don''t add up.', 'the duties must be the sum of the layers');
select throws_ok($$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines('0.01', '20.39'), '32.74', '1522.07', '15.22', true)) $$,
  '23514', 'A manual rate doesn''t match the saved workspace.', 'a manual layer at the wrong amount (0% of $600.00 is $0.00)');
select throws_ok(
  $$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines('0.00', '20.40', '00000000-0000-4000-8000-000000401399'), '32.74', '1522.07', '15.22', true)) $$,
  '23514', 'A manual rate doesn''t match the saved workspace.', 'a manual layer that isn''t one of the workspace''s');
select throws_ok(
  $$ select pg_temp.lock(pg_temp.row(true, jsonb_build_array(pg_temp.line('duty', 'general', '20.40'),
       pg_temp.line('additional', 'section_301', '0.00', pg_temp.manual('00000000-0000-4000-8000-000000401301', 'replace', '0', null))),
       '20.40', '1509.73', '15.10', true)) $$,
  '23514', 'A manual rate doesn''t match the saved workspace.', 'every live manual rate must be applied');
select throws_ok(
  $$ select pg_temp.lock(jsonb_set(pg_temp.row(true, pg_temp.lines(), '32.74', '1522.07', '15.22', true),
       '{inputs,scenarios,0,items,0,overrides,0,ratePercent}', '"5"')) $$,
  'LC409', null, 'the inputs must carry the saved manual rates');
select throws_ok(
  $$ select pg_temp.lock(pg_temp.row(true, pg_temp.lines(), '32.74', '1522.07', '15.22', true) #- '{inputs,scenarios,0,items,0,overrides}') $$,
  'LC422', null, 'a version 2 item must list its manual rates');
select throws_ok($$ select pg_temp.lock(jsonb_set(pg_temp.row(true, pg_temp.lines(), '32.74', '1522.07', '15.22', true), '{schema_version}', '3')) $$,
  'LC422', null, 'schema version 3 doesn''t exist');
-- Without manual rates, a version 1 row (the app before this change) locks as before.
delete from landed_cost_rate_overrides where workspace_id = '00000000-0000-4000-8000-000000400001';
select lives_ok(
  $$ select pg_temp.lock(pg_temp.row(false, jsonb_build_array(pg_temp.line('duty', 'general', '20.40')), '20.40', '1509.73', '15.10', false)) $$,
  'with no manual rates, a version 1 row still locks');
select is(
  (select array_agg(schema_version order by version_no) from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000400001'),
  array[2, 1], 'v1 (version 2) and v2 (version 1)');

-- Deleting the workspace's versions, then the workspace, takes its manual rates with it.
select pg_temp.ovr('add', null, 'Anti-dumping', 10, null);
delete from landed_cost_snapshots where workspace_id = '00000000-0000-4000-8000-000000400001';
delete from landed_cost_workspaces where id = '00000000-0000-4000-8000-000000400001';
select is(pg_temp.mine(), 0, 'deleting the workspace deletes its manual rates');

select * from finish();
rollback;
