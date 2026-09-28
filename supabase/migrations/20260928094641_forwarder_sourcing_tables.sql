-- Forwarder Sourcing module: projects, forwarders and their quotes.
--
-- forwarder_projects  one per forwarding engagement for a shared client
-- forwarders          one per forwarder considered for a project
-- forwarder_quotes    one per forwarder x quotation scenario
--
-- Access follows the 3PL module: any signed-in user can read; writes are
-- limited to the owner of the parent forwarder project, or an admin.

-- ============================================================
-- 1. forwarder_projects
-- ============================================================
create table forwarder_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  owner_id uuid not null references auth.users(id),
  status text not null default 'Active'
    constraint forwarder_projects_status_check
    check (status in ('Active', 'On Hold', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Per-field provenance: { "<field>": { "source": ..., "note": ... } }
  field_sources jsonb not null default '{}',

  packing_list_available text
    constraint forwarder_projects_packing_list_available_check
    check (packing_list_available in ('Yes', 'No')),
  packing_list_reference text,
  packing_list_notes text,

  origin_country text,
  origin_city text,
  origin_port text,
  destination_country text,
  destination_city text,
  destination_port text,
  final_delivery_address text,

  weight_kg numeric(14,3),
  cbm numeric(14,6),
  pallets integer,
  cartons integer,

  cargo_description text,
  packaging_type text,
  units integer,
  stackable text
    constraint forwarder_projects_stackable_check
    check (stackable in ('Yes', 'No', 'Unknown')),
  dangerous_goods text
    constraint forwarder_projects_dangerous_goods_check
    check (dangerous_goods in ('Yes', 'No')),
  temperature_controlled text
    constraint forwarder_projects_temperature_controlled_check
    check (temperature_controlled in ('Yes', 'No')),
  special_handling text,

  shipment_mode text
    constraint forwarder_projects_shipment_mode_check
    check (shipment_mode in ('Air', 'Sea', 'Road')),
  shipment_type text
    constraint forwarder_projects_shipment_type_check
    check (shipment_type in ('FCL', 'LCL', 'Air Freight', 'Courier',
      'Full Truck Load (FTL)', 'Less-than-Truckload (LTL)')),

  current_incoterm text
    constraint forwarder_projects_current_incoterm_check
    check (current_incoterm in ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF',
      'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'DDU (legacy term)')),
  final_incoterm text
    constraint forwarder_projects_final_incoterm_check
    check (final_incoterm in ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF',
      'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'DDU (legacy term)')),
  -- Every element must be a known incoterm; a NULL element fails the check.
  incoterms_to_compare text[] not null default '{}'
    constraint forwarder_projects_incoterms_to_compare_check
    check (incoterms_to_compare <@ array['EXW', 'FCA', 'FAS', 'FOB', 'CFR',
      'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'DDU (legacy term)']::text[]),
  final_shipment_mode text
    constraint forwarder_projects_final_shipment_mode_check
    check (final_shipment_mode in ('Air', 'Sea', 'Road')),
  final_shipment_type text
    constraint forwarder_projects_final_shipment_type_check
    check (final_shipment_type in ('FCL', 'LCL', 'Air Freight', 'Courier',
      'Full Truck Load (FTL)', 'Less-than-Truckload (LTL)')),

  -- Text, never numeric: HS codes can have significant leading zeros.
  hs_code text,
  invoice_value numeric(14,2),
  invoice_currency text,

  current_freight_cost_usd numeric(14,2),
  current_freight_forwarder text,

  shipments_per_month numeric(10,2),
  shipments_per_year numeric(10,2),

  current_lead_time_days numeric(6,1),
  target_lead_time_days numeric(6,1),

  insurance_required text
    constraint forwarder_projects_insurance_required_check
    check (insurance_required in ('Yes', 'No', 'Quote Both With and Without')),
  brokerage_needed text
    constraint forwarder_projects_brokerage_needed_check
    check (brokerage_needed in ('Yes', 'No', 'N/A'))
);

create index forwarder_projects_client_id_idx on forwarder_projects (client_id);
create index forwarder_projects_owner_id_idx on forwarder_projects (owner_id);

create trigger forwarder_projects_set_updated_at
  before update on forwarder_projects
  for each row execute function set_updated_at();

-- ============================================================
-- 2. forwarders
-- ============================================================
create table forwarders (
  id uuid primary key default gen_random_uuid(),
  forwarder_project_id uuid not null
    references forwarder_projects(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  company_name text not null,
  website text,
  headquarters text,
  footprint text,
  contact_person text,
  contact_position text,
  email text,
  phone text,
  origin_coverage text,
  destination_coverage text,
  other_services text,

  -- Capabilities: true = confirmed; false = NOT YET CONFIRMED (not "no").
  air_freight boolean not null default false,
  sea_freight boolean not null default false,
  road_freight boolean not null default false,
  fcl boolean not null default false,
  lcl boolean not null default false,
  courier_express boolean not null default false,
  customs_brokerage boolean not null default false,
  cargo_insurance boolean not null default false,
  door_to_door boolean not null default false,
  port_to_port boolean not null default false,
  customs_import_assistance boolean not null default false,

  status text not null default 'Potential / Not Contacted'
    constraint forwarders_status_check
    check (status in ('Potential / Not Contacted', 'Contacted', 'RFQ Sent',
      'Scheduled for Discovery / Clarification Call', 'Waiting for Quotation',
      'Reviewing Quotation', 'Clarifications', 'Negotiation', 'Shortlisted',
      'Vetted', 'Unfit', 'Do Not Contact', 'Withdrawn / No Response',
      'Completed / Closed')),
  assessment text
    constraint forwarders_assessment_check
    check (assessment in ('Under Assessment', 'Fit', 'Move Recommended',
      'Unfit', 'Awarded / Approved')),
  next_action text,
  key_notes text
);

create index forwarders_forwarder_project_id_idx
  on forwarders (forwarder_project_id);

create trigger forwarders_set_updated_at
  before update on forwarders
  for each row execute function set_updated_at();

-- ============================================================
-- 3. forwarder_quotes
-- ============================================================
create table forwarder_quotes (
  id uuid primary key default gen_random_uuid(),
  forwarder_id uuid not null references forwarders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  scenario_group text not null,
  shipment_mode text
    constraint forwarder_quotes_shipment_mode_check
    check (shipment_mode in ('Air', 'Sea', 'Road')),
  shipment_type text
    constraint forwarder_quotes_shipment_type_check
    check (shipment_type in ('FCL', 'LCL', 'Air Freight', 'Courier',
      'Full Truck Load (FTL)', 'Less-than-Truckload (LTL)')),
  origin text,
  destination text,
  incoterm text
    constraint forwarder_quotes_incoterm_check
    check (incoterm in ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT',
      'CIP', 'DAP', 'DPU', 'DDP', 'DDU (legacy term)')),

  actual_weight_kg numeric(14,3),
  chargeable_weight_kg numeric(14,3),
  cbm numeric(14,6),
  cost_of_goods_usd numeric(14,2),

  original_currency text not null default 'USD'
    constraint forwarder_quotes_original_currency_check
    check (original_currency in ('USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD',
      'AUD', 'MXN', 'INR', 'PHP', 'VND', 'THB', 'HKD', 'SGD', 'KRW')),
  original_amount numeric(16,2),
  -- Wide scale so tiny rates survive (1 VND = 0.00004 USD).
  exchange_rate_to_usd numeric(20,10) not null default 1,

  duties_taxes_usd numeric(14,2),
  other_charges_usd numeric(14,2),
  other_charges_description text,

  lead_time_min_days numeric(6,1),
  lead_time_max_days numeric(6,1),

  quote_completeness text
    constraint forwarder_quotes_quote_completeness_check
    check (quote_completeness in ('Complete / Comparable',
      'Comparable with Adjustment', 'Incomplete / Needs Clarification')),

  quote_date date,
  rate_valid_until date,
  quote_reference text,

  key_strength text,
  key_weakness_risk text,
  important_assumption text,
  overall_assessment text
    constraint forwarder_quotes_overall_assessment_check
    check (overall_assessment in ('Under Assessment', 'Fit',
      'Move Recommended', 'Unfit', 'Awarded / Approved')),
  client_decision text
    constraint forwarder_quotes_client_decision_check
    check (client_decision in ('Pending', 'Client Approved',
      'Move Recommended - Awaiting Client', 'Selected', 'Not Selected',
      'On Hold')),
  notes text
);

create index forwarder_quotes_forwarder_id_idx on forwarder_quotes (forwarder_id);
create index forwarder_quotes_forwarder_id_scenario_group_idx
  on forwarder_quotes (forwarder_id, scenario_group);

create trigger forwarder_quotes_set_updated_at
  before update on forwarder_quotes
  for each row execute function set_updated_at();

-- ============================================================
-- 4. Row level security
-- ============================================================
alter table forwarder_projects enable row level security;
alter table forwarders enable row level security;
alter table forwarder_quotes enable row level security;

-- forwarder_projects -----------------------------------------
create policy "Authenticated users can view all forwarder projects"
  on forwarder_projects for select to authenticated
  using (true);

create policy "Owner or admin can create forwarder projects"
  on forwarder_projects for insert to authenticated
  with check (owner_id = auth.uid() or is_admin());

-- WITH CHECK stops an owner handing the project to someone else; only an
-- admin can change owner_id.
create policy "Owner or admin can update forwarder projects"
  on forwarder_projects for update to authenticated
  using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());

create policy "Owner or admin can delete forwarder projects"
  on forwarder_projects for delete to authenticated
  using (owner_id = auth.uid() or is_admin());

-- forwarders -------------------------------------------------
create policy "Authenticated users can view all forwarders"
  on forwarders for select to authenticated
  using (true);

create policy "Owner or admin can insert forwarders"
  on forwarders for insert to authenticated
  with check (exists (
    select 1 from forwarder_projects fp
    where fp.id = forwarders.forwarder_project_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

-- WITH CHECK also applies to the new row, so a forwarder can't be moved
-- into a project the user doesn't own.
create policy "Owner or admin can update forwarders"
  on forwarders for update to authenticated
  using (exists (
    select 1 from forwarder_projects fp
    where fp.id = forwarders.forwarder_project_id
      and (fp.owner_id = auth.uid() or is_admin())
  ))
  with check (exists (
    select 1 from forwarder_projects fp
    where fp.id = forwarders.forwarder_project_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

create policy "Owner or admin can delete forwarders"
  on forwarders for delete to authenticated
  using (exists (
    select 1 from forwarder_projects fp
    where fp.id = forwarders.forwarder_project_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

-- forwarder_quotes (owner is found through forwarder -> project) -----
create policy "Authenticated users can view all forwarder quotes"
  on forwarder_quotes for select to authenticated
  using (true);

create policy "Owner or admin can insert forwarder quotes"
  on forwarder_quotes for insert to authenticated
  with check (exists (
    select 1 from forwarders f
    join forwarder_projects fp on fp.id = f.forwarder_project_id
    where f.id = forwarder_quotes.forwarder_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

create policy "Owner or admin can update forwarder quotes"
  on forwarder_quotes for update to authenticated
  using (exists (
    select 1 from forwarders f
    join forwarder_projects fp on fp.id = f.forwarder_project_id
    where f.id = forwarder_quotes.forwarder_id
      and (fp.owner_id = auth.uid() or is_admin())
  ))
  with check (exists (
    select 1 from forwarders f
    join forwarder_projects fp on fp.id = f.forwarder_project_id
    where f.id = forwarder_quotes.forwarder_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

create policy "Owner or admin can delete forwarder quotes"
  on forwarder_quotes for delete to authenticated
  using (exists (
    select 1 from forwarders f
    join forwarder_projects fp on fp.id = f.forwarder_project_id
    where f.id = forwarder_quotes.forwarder_id
      and (fp.owner_id = auth.uid() or is_admin())
  ));

-- ============================================================
-- 5. Grants
-- ============================================================
grant select, insert, update, delete on table forwarder_projects
  to authenticated, service_role;
grant select, insert, update, delete on table forwarders
  to authenticated, service_role;
grant select, insert, update, delete on table forwarder_quotes
  to authenticated, service_role;

revoke all on table forwarder_projects from anon;
revoke all on table forwarders from anon;
revoke all on table forwarder_quotes from anon;
