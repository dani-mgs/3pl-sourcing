-- A new 3PL project with a new client, in one transaction (QA regression
-- 2026-10-09, B-9).
--
-- The intake action created the client first, as its own request, and only
-- then validated and inserted the project. A project that failed left the
-- client behind, and every retry was refused with "already exists". The
-- action now validates everything first and calls this function, so the
-- client and project are created together or not at all. (Cleaning up after a
-- failed project insert isn't possible: only admins may delete clients.)
--
-- Runs as the caller, so RLS applies exactly as for the two separate inserts:
-- the role gate, "Authenticated users can create clients", and the project
-- insert check (owner_id = auth.uid() or is_admin()). owner_id, status and
-- client_id are set here, never read from p_project. A name that is already
-- taken (clients_name_unique) raises 23505 and nothing is written.
--
-- v_allowed must match THREE_PL_PROJECT_FIELDS in
-- src/lib/three-pl/parse-project-form.ts (a Vitest check compares them).

create function public.create_three_pl_project_with_client(
  p_client_name text,
  p_client_business_model text,
  p_project jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'target_geography', 'contract_period_months', 'benchmark_period',
    'avg_monthly_orders', 'peak_monthly_orders', 'latest_month_orders',
    'avg_monthly_units', 'peak_monthly_units',
    'core_cost_categories', 'main_decision_focus', 'key_capability_needs',
    'tech_integration_requirement', 'special_handling_requirement',
    'fixed_comparison_principle', 'important_limitation', 'assumptions_data_limitations'
  ];
  v public.three_pl_projects;
  v_name text := trim(coalesce(p_client_name, ''));
  v_client_id uuid;
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a project.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Client name is required.' using errcode = '22023';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'The project must be an object.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_project) k where k <> all (v_allowed)) then
    raise exception 'The project has a field that can''t be set.' using errcode = '22023';
  end if;

  v := jsonb_populate_record(null::public.three_pl_projects, p_project);

  insert into public.clients (name, business_model)
  values (v_name, nullif(trim(coalesce(p_client_business_model, '')), ''))
  returning id into v_client_id;

  insert into public.three_pl_projects (
    client_id, owner_id, status,
    target_geography, contract_period_months, benchmark_period,
    avg_monthly_orders, peak_monthly_orders, latest_month_orders,
    avg_monthly_units, peak_monthly_units,
    core_cost_categories, main_decision_focus, key_capability_needs,
    tech_integration_requirement, special_handling_requirement,
    fixed_comparison_principle, important_limitation, assumptions_data_limitations
  ) values (
    v_client_id, auth.uid(), 'Active',
    v.target_geography, v.contract_period_months, v.benchmark_period,
    v.avg_monthly_orders, v.peak_monthly_orders, v.latest_month_orders,
    v.avg_monthly_units, v.peak_monthly_units,
    v.core_cost_categories, v.main_decision_focus, v.key_capability_needs,
    v.tech_integration_requirement, v.special_handling_requirement,
    v.fixed_comparison_principle, v.important_limitation, v.assumptions_data_limitations
  )
  returning id into v_project_id;

  return v_project_id;
end;
$$;

revoke all on function public.create_three_pl_project_with_client(text, text, jsonb) from public, anon;
grant execute on function public.create_three_pl_project_with_client(text, text, jsonb) to authenticated;
