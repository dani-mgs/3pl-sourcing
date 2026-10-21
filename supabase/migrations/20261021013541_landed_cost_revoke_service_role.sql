-- Landed Cost workspaces: no service_role access. Supabase's default
-- privileges give service_role every privilege on a new table, which
-- 20261021013030_landed_cost_workspaces didn't revoke. Nothing uses the
-- service role for these tables (docs/SECURITY.md), so it gets none.

revoke all on table public.landed_cost_workspaces, public.landed_cost_sku_lines, public.landed_cost_scenarios,
  public.landed_cost_scenario_items, public.landed_cost_other_costs from service_role;
revoke all on function public.landed_cost_text_ok(text, integer, integer),
  public.landed_cost_entered_value_ok(bigint, numeric), public.landed_cost_row_limit(),
  public.landed_cost_item_value_check(), public.landed_cost_sku_quantity_check() from service_role;
