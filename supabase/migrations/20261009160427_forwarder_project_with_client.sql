-- A new forwarder project with a new client, in one transaction (QA
-- regression 2026-10-09, the forwarder follow-up to B-9).
--
-- saveForwarderProject validated the form first, but then created the client
-- and the project as two separate requests, so a project insert that failed
-- left the client behind (and only admins may delete clients). The action now
-- calls this function, so the client and project are created together or not
-- at all. Same pattern as create_three_pl_project_with_client.
--
-- Runs as the caller, so RLS applies exactly as for the two separate inserts:
-- the role gate, "Authenticated users can create clients", and the project
-- insert check (owner_id = auth.uid() or is_admin()). owner_id, status and
-- client_id are set here, never read from p_project; a new project always
-- starts Active. A name that is already taken (clients_name_unique) raises
-- 23505 and nothing is written.
--
-- v_allowed must match FORWARDER_PROJECT_FIELDS in
-- src/lib/forwarder/parse-project-form.ts, minus status (a Vitest check
-- compares them).

create function public.create_forwarder_project_with_client(
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
    'project_duration_months',
    'packing_list_available', 'packing_list_reference', 'packing_list_notes',
    'origin_country', 'origin_city', 'origin_port',
    'destination_country', 'destination_city', 'destination_port', 'final_delivery_address',
    'weight_kg', 'cbm', 'pallets', 'cartons',
    'cargo_description', 'packaging_type', 'units', 'stackable',
    'dangerous_goods', 'temperature_controlled', 'special_handling',
    'shipment_mode', 'shipment_type',
    'current_incoterm', 'final_incoterm', 'incoterms_to_compare',
    'final_shipment_mode', 'final_shipment_type',
    'hs_code', 'invoice_value', 'invoice_currency',
    'current_freight_cost_usd', 'current_freight_forwarder',
    'shipments_per_month', 'shipments_per_year',
    'current_lead_time_days', 'target_lead_time_days',
    'insurance_required', 'brokerage_needed'
  ];
  v public.forwarder_projects;
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

  v := jsonb_populate_record(null::public.forwarder_projects, p_project);

  insert into public.clients (name, business_model)
  values (v_name, nullif(trim(coalesce(p_client_business_model, '')), ''))
  returning id into v_client_id;

  insert into public.forwarder_projects (
    client_id, owner_id, status,
    project_duration_months,
    packing_list_available, packing_list_reference, packing_list_notes,
    origin_country, origin_city, origin_port,
    destination_country, destination_city, destination_port, final_delivery_address,
    weight_kg, cbm, pallets, cartons,
    cargo_description, packaging_type, units, stackable,
    dangerous_goods, temperature_controlled, special_handling,
    shipment_mode, shipment_type,
    current_incoterm, final_incoterm, incoterms_to_compare,
    final_shipment_mode, final_shipment_type,
    hs_code, invoice_value, invoice_currency,
    current_freight_cost_usd, current_freight_forwarder,
    shipments_per_month, shipments_per_year,
    current_lead_time_days, target_lead_time_days,
    insurance_required, brokerage_needed
  ) values (
    v_client_id, auth.uid(), 'Active',
    v.project_duration_months,
    v.packing_list_available, v.packing_list_reference, v.packing_list_notes,
    v.origin_country, v.origin_city, v.origin_port,
    v.destination_country, v.destination_city, v.destination_port, v.final_delivery_address,
    v.weight_kg, v.cbm, v.pallets, v.cartons,
    v.cargo_description, v.packaging_type, v.units, v.stackable,
    v.dangerous_goods, v.temperature_controlled, v.special_handling,
    v.shipment_mode, v.shipment_type,
    v.current_incoterm, v.final_incoterm, coalesce(v.incoterms_to_compare, '{}'),
    v.final_shipment_mode, v.final_shipment_type,
    v.hs_code, v.invoice_value, v.invoice_currency,
    v.current_freight_cost_usd, v.current_freight_forwarder,
    v.shipments_per_month, v.shipments_per_year,
    v.current_lead_time_days, v.target_lead_time_days,
    v.insurance_required, v.brokerage_needed
  )
  returning id into v_project_id;

  return v_project_id;
end;
$$;

revoke all on function public.create_forwarder_project_with_client(text, text, jsonb) from public, anon;
grant execute on function public.create_forwarder_project_with_client(text, text, jsonb) to authenticated;
