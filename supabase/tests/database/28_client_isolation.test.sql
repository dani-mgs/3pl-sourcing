-- External client users (role 'client' + app_metadata.client_id) see and
-- change NOTHING internal. Every check that loops over tables or views reads
-- the catalog, so a table added later is covered without editing this file;
-- client_entitlements is the one table a client may read (pgTAP 29), named
-- here on purpose. Staff behaviour is unchanged. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Rows a user can read, per RLS table.
create function pg_temp.visible_rows() returns table (tbl text, n bigint) language plpgsql as $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1 loop
    tbl := t;
    execute format('select count(*) from public.%I', t) into n;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.visible_rows() to authenticated;

-- Rows a user can read through each view.
create function pg_temp.visible_view_rows() returns table (vw text, n bigint) language plpgsql as $$
declare v text;
begin
  for v in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('v', 'm') order by 1 loop
    vw := v;
    execute format('select count(*) from public.%I', v) into n;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.visible_view_rows() to authenticated;

-- Rows changed by a no-op UPDATE (first column set to itself) and a DELETE on
-- every RLS table but client_entitlements. RLS filters silently, so a refused
-- write changes 0 rows rather than raising.
create function pg_temp.rows_written() returns table (tbl text, updated bigint, deleted bigint) language plpgsql as $$
declare t text; col text;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
             and c.relname <> 'client_entitlements' order by 1 loop
    tbl := t;
    select a.attname into col from pg_attribute a
     where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and a.attidentity = '' order by a.attnum limit 1;
    begin
      execute format('update public.%I set %I = %I', t, col, col);
      get diagnostics updated = row_count;
    exception when insufficient_privilege then updated := 0;
    end;
    begin
      execute format('delete from public.%I', t);
      get diagnostics deleted = row_count;
    exception when insufficient_privilege then deleted := 0;
    end;
    return next;
  end loop;
end $$;
grant execute on function pg_temp.rows_written() to authenticated;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'expert@test.local', '{"role":"logistics_expert"}', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{"role":"admin"}', '{}');
insert into clients (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'pgTAP Client One'),
  ('00000000-0000-4000-8000-00000000c002', 'pgTAP Client Two');
-- A client user, with an editor flag and admin claims in user_metadata that
-- must change nothing.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'client@test.local',
   '{"role":"client","client_id":"00000000-0000-4000-8000-00000000c001","tariff_editor":true}', '{"role":"admin"}');
insert into three_pl_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into three_pl_providers (id, three_pl_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000301', 'pgTAP 3PL');
insert into rate_details (provider_id, storage_rate) values ('00000000-0000-4000-8000-000000000302', 1);
insert into recommendation (three_pl_project_id, priority, provider_id_1) values
  ('00000000-0000-4000-8000-000000000301', 'Cost Savings', '00000000-0000-4000-8000-000000000302');
insert into forwarder_projects (id, owner_id, client_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001');
insert into forwarders (id, forwarder_project_id, company_name) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'pgTAP Forwarder');
insert into forwarder_quotes (forwarder_id, notes) values ('00000000-0000-4000-8000-000000000402', 'INTERNAL-CANARY');
insert into fx_rates (rate_date, currency, rate_to_usd) values ('2026-10-01', 'EUR', 1.08)
  on conflict do nothing;
-- A Landed Cost workspace with one row in each child table.
insert into landed_cost_workspaces (id, owner_id, name, entry_date) values
  ('00000000-0000-4000-8000-000000003701', '00000000-0000-4000-8000-0000000000a1', 'pgTAP workspace', '2026-11-01');
insert into landed_cost_sku_lines (id, workspace_id, sku_code, hts_code, quantity) values
  ('00000000-0000-4000-8000-000000003702', '00000000-0000-4000-8000-000000003701', 'SKU-1', '6402993110', 100);
insert into landed_cost_scenarios (id, workspace_id, label, origin_country, incoterm, shipment_mode) values
  ('00000000-0000-4000-8000-000000003703', '00000000-0000-4000-8000-000000003701', 'China', 'CN', 'FOB', 'Sea');
insert into landed_cost_scenario_items (workspace_id, scenario_id, sku_line_id, fob_unit_price_usd) values
  ('00000000-0000-4000-8000-000000003701', '00000000-0000-4000-8000-000000003703', '00000000-0000-4000-8000-000000003702', 6);
insert into landed_cost_other_costs (workspace_id, scenario_id, label, amount_usd) values
  ('00000000-0000-4000-8000-000000003701', '00000000-0000-4000-8000-000000003703', 'Broker fee', 95);
-- A locked version (written as the table's owner; the app goes through save_landed_cost_snapshot).
insert into landed_cost_snapshots (workspace_id, version_no, created_by, as_of_date, workspace_name, entry_date, workspace_updated_at,
  hts_release_id, hts_release_name, schema_version, inputs, result, origin_count, baseline_label, baseline_per_unit_usd, incomplete) values
  ('00000000-0000-4000-8000-000000003701', 1, '00000000-0000-4000-8000-0000000000a1', current_date, 'pgTAP workspace', '2026-11-01', now(),
   '00000000-0000-4000-8000-00000000ba01', 'pgTAP', 1, '{}', '{}', 1, 'China', 17.35, false);
insert into client_entitlements (client_id, tier) values
  ('00000000-0000-4000-8000-00000000c001', 'market_report'),
  ('00000000-0000-4000-8000-00000000c002', 'free');
-- A current release with one line, to search for (works on a seeded database:
-- any current release steps aside, rolled back).
update hts_releases set status = 'superseded' where status = 'current';
insert into hts_releases (id, name, status) values ('00000000-0000-4000-8000-00000000ba01', 'pgTAP', 'current');
insert into hts_lines (release_id, hts_code, chapter, indent, description) values
  ('00000000-0000-4000-8000-00000000ba01', '6402993110', '64', 2, 'Footwear, rubber soles');

create temp table true_counts as select * from pg_temp.visible_rows();
grant select on true_counts to authenticated;
select ok(
  (select bool_and(n > 0) from pg_temp.true_counts
   where tbl in ('clients', 'three_pl_projects', 'three_pl_providers', 'rate_details', 'recommendation',
                 'forwarder_projects', 'forwarders', 'forwarder_quotes', 'profiles', 'fx_rates', 'hts_lines', 'client_entitlements',
                 'landed_cost_other_costs', 'landed_cost_scenario_items', 'landed_cost_scenarios', 'landed_cost_sku_lines', 'landed_cost_snapshots', 'landed_cost_workspaces')),
  'there is data to hide in the main tables (the checks below aren''t vacuous)');

-- ---- The client's view of itself -------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(has_staff_role(), false, 'has_staff_role() is false for a client');
select is(is_client_user(), true, 'is_client_user() is true for a client');
select is(my_client_id(), '00000000-0000-4000-8000-00000000c001'::uuid, 'my_client_id() is its client');
select is(is_admin(), false, 'a client is not an admin, whatever user_metadata says');

-- ---- Reads ------------------------------------------------------------------------
select is(
  (select array_agg(tbl order by tbl) from pg_temp.visible_rows() where n > 0 and tbl <> 'client_entitlements'),
  null, 'a client reads 0 rows from every internal RLS table');
select is(
  (select n::int from pg_temp.visible_rows() where tbl = 'client_entitlements'), 1,
  'and only its own entitlement row');
select is(
  (select array_agg(vw order by vw) from pg_temp.visible_view_rows() where n > 0),
  null, 'a client reads 0 rows from every view');
select is_empty($$ select * from public.search_hts_lines(array['footwear'], null, 10) $$, 'nor through the HTS search');
select is_empty($$ select * from public.search_hts_lines(null, '6402', 10) $$, 'nor by HTS code');
select is_empty($$ select 1 from forwarder_quotes where notes like '%INTERNAL-CANARY%' $$, 'the canary quote is invisible');
select is_empty($$ select 1 from profiles $$, 'nor any profile, its own included');

-- ---- Writes ------------------------------------------------------------------------
select is(
  (select array_agg(tbl order by tbl) from pg_temp.rows_written() where updated > 0 or deleted > 0),
  null, 'a client updates and deletes 0 rows in every internal RLS table');
select throws_ok($$ insert into clients (name) values ('Sneaky Co') $$, '42501', null, 'a client cannot add a client');
select throws_ok(
  $$ insert into three_pl_projects (owner_id, client_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c001') $$,
  '42501', null, 'nor a 3PL project of its own');
select throws_ok(
  $$ insert into forwarder_projects (owner_id, client_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c001') $$,
  '42501', null, 'nor a forwarder project');
select throws_ok(
  $$ insert into three_pl_providers (three_pl_project_id, company_name) values ('00000000-0000-4000-8000-000000000301', 'x') $$,
  '42501', null, 'nor a 3PL');
select throws_ok(
  $$ insert into forwarders (forwarder_project_id, company_name) values ('00000000-0000-4000-8000-000000000401', 'x') $$,
  '42501', null, 'nor a forwarder');
select throws_ok(
  $$ insert into forwarder_quotes (forwarder_id) values ('00000000-0000-4000-8000-000000000402') $$,
  '42501', null, 'nor a quote');
select throws_ok(
  $$ insert into recommendation (three_pl_project_id, priority) values ('00000000-0000-4000-8000-000000000301', 'Cost Savings') $$,
  '42501', null, 'nor a recommendation');
select throws_ok(
  $$ insert into rate_details (provider_id) values ('00000000-0000-4000-8000-000000000302') $$,
  '42501', null, 'nor rate details');
select throws_ok(
  $$ insert into fx_rates (rate_date, currency, rate_to_usd) values ('2026-10-02', 'EUR', 1) $$,
  '42501', null, 'nor an exchange rate');
select is_empty(
  $$ update customs_fees set notes = 'x' returning id $$,
  'nor change a customs fee, despite a tariff_editor flag');
select throws_ok(
  $$ insert into duty_estimates (label) values ('x') $$, '42501', null, 'nor a duty estimate');
select throws_ok(
  $$ insert into profiles (id, email, role) values (gen_random_uuid(), 'x@test.local', 'admin') $$,
  '42501', null, 'nor a profile');
select throws_ok(
  $$ insert into client_entitlements (client_id, tier) values ('00000000-0000-4000-8000-00000000c002', 'market_report') $$,
  '42501', null, 'nor an entitlement');
select throws_ok($$ truncate public.forwarder_quotes $$, '42501', null, 'nor truncate');

-- ---- RPCs ---------------------------------------------------------------------------
select throws_ok(
  $$ select create_three_pl_project_with_client('Portal Co', null, '{}'::jsonb) $$,
  '42501', null, 'create_three_pl_project_with_client is refused');
select throws_ok(
  $$ select create_forwarder_project_with_client('Portal Co', null, '{}'::jsonb) $$,
  '42501', null, 'create_forwarder_project_with_client is refused');
select ok(
  not has_function_privilege('authenticated', 'public.save_duty_estimate(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.has_staff_role_user(uuid)', 'execute'),
  'save_duty_estimate and has_staff_role_user are not callable by signed-in users');
reset role;

set local role service_role;
select throws_ok(
  $$ select save_duty_estimate('00000000-0000-4000-8000-0000000000c1', '{"label":"x"}'::jsonb) $$,
  '42501', 'This account has no role yet.', 'save_duty_estimate refuses a client user even via the service role');
reset role;

select is(
  (select array_agg(tbl || '=' || n order by tbl) from pg_temp.visible_rows()),
  (select array_agg(tbl || '=' || n order by tbl) from pg_temp.true_counts),
  'after all that, every table still has the same rows');

-- ---- The old helper names are gone ------------------------------------------------
select hasnt_function('public', 'has_app_role', array[]::text[], 'has_app_role() is dropped');
select hasnt_function('public', 'has_app_role_user', array['uuid'], 'has_app_role_user() is dropped');

-- ---- Staff unchanged --------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(has_staff_role(), true, 'an expert has a staff role');
select is(is_client_user(), false, 'an expert is not a client user');
select is(my_client_id(), null, 'and has no client');
select is(
  (select array_agg(tbl || '=' || n order by tbl) from pg_temp.visible_rows()),
  (select array_agg(tbl || '=' || n order by tbl) from pg_temp.true_counts),
  'an expert reads every row of every RLS table, entitlements included');
select is((select count(*)::int from public.search_hts_lines(array['footwear'], null, 10)), 1, 'an expert''s HTS search works');
select isnt_empty(
  $$ update forwarder_projects set cargo_description = 'by owner' where id = '00000000-0000-4000-8000-000000000401' returning id $$,
  'an expert still edits their own project');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000ad');
select is(has_staff_role(), true, 'an admin has a staff role');
reset role;

select * from finish();
rollback;
