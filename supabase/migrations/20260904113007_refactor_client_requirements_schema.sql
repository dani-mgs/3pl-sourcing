-- ============================================================
-- 1. Rename projects -> client_requirements, drop project_name,
--    add new fields, migrate mappable requirements_summary data
-- ============================================================
alter table projects rename to client_requirements;
alter table client_requirements drop column project_name;

alter table client_requirements
  add column current_incumbent_3pl text,
  add column target_geography text,
  add column benchmark_period text,
  add column avg_monthly_orders integer,
  add column peak_monthly_orders integer,
  add column latest_month_orders integer,
  add column avg_monthly_units integer,
  add column peak_monthly_units integer,
  add column business_model text,
  add column core_cost_categories text,
  add column main_decision_focus text,
  add column key_capability_needs text,
  add column tech_integration_requirement text,
  add column special_handling_requirement text,
  add column fixed_comparison_principle text,
  add column important_limitation text,
  add column assumptions_data_limitations text;

-- Migrate only the fields that map directly; the rest of
-- requirements_summary's data does not survive (see chat notes)
update client_requirements cr
set
  target_geography = rs.location,
  special_handling_requirement = rs.special_handling
from requirements_summary rs
where rs.project_id = cr.id;

drop table requirements_summary;

-- ============================================================
-- 2. Rename providers -> 3pl_providers, re-key FK, drop
--    superseded free-text fields, add new structured fields
-- ============================================================
alter table providers rename to three_pl_providers;
alter table three_pl_providers rename column project_id to client_requirement_id;
alter table three_pl_providers drop column cost;
alter table three_pl_providers drop column service_capability;
alter table three_pl_providers drop column turnaround_time;

alter table three_pl_providers
  add column provider_type text,
  add column footprint_source text,
  add column receiving boolean not null default false,
  add column storage boolean not null default false,
  add column fulfillment boolean not null default false,
  add column dispatch boolean not null default false,
  add column adhoc_kitting_bundling boolean not null default false,
  add column adhoc_labelling boolean not null default false,
  add column annual_inventory_count boolean not null default false,
  add column cycle_count boolean not null default false,
  add column inventory_count_on_request boolean not null default false,
  add column one_time_system_setup boolean not null default false,
  add column lot_batch_expiry_tracking boolean not null default false,
  add column temp_controlled_storage boolean not null default false,
  add column retail_edi_compliance boolean not null default false,
  add column cross_docking boolean not null default false,
  add column onboarding_period_months integer,
  add column virtual_tour_url text,
  add column billing_terms text,
  add column other_specialization text,
  add column b2b boolean not null default false,
  add column b2c boolean not null default false,
  add column is_incumbent boolean not null default false,
  add column storage_cost numeric(12,2),
  add column pick_pack_cost numeric(12,2),
  add column receiving_cost numeric(12,2),
  add column returns_cost numeric(12,2),
  add column key_strength text,
  add column key_weakness_risk text,
  add column important_assumption text,
  add column overall_assessment text,
  add column client_decision text,
  add column source_basis text,
  add column next_action text,
  add column key_notes text,
  add column updated_at timestamptz not null default now();

-- One provider per client engagement can be flagged incumbent
create unique index one_incumbent_per_client
  on three_pl_providers (client_requirement_id)
  where is_incumbent = true;

-- ============================================================
-- 3. New rate_details table (1-to-1 per provider)
-- ============================================================
create table rate_details (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references three_pl_providers(id) not null unique,
  receiving_rate numeric(12,2),
  storage_rate numeric(12,2),
  fulfillment_rate numeric(12,2),
  dispatch_rate numeric(12,2),
  adhoc_kitting_rate numeric(12,2),
  adhoc_labelling_rate numeric(12,2),
  returns_rate numeric(12,2),
  annual_inv_count_rate numeric(12,2),
  cycle_count_rate numeric(12,2),
  inv_count_on_request_rate numeric(12,2),
  setup_rate numeric(12,2),
  onboarding_fee numeric(12,2),
  security_deposit numeric(12,2),
  updated_at timestamptz not null default now()
);

alter table rate_details enable row level security;

create policy "Authenticated users can view rate details"
  on rate_details for select to authenticated using (true);
create policy "Authenticated users can insert rate details"
  on rate_details for insert to authenticated with check (true);
create policy "Authenticated users can update rate details"
  on rate_details for update to authenticated using (true);
create policy "Authenticated users can delete rate details"
  on rate_details for delete to authenticated using (true);

grant select, insert, update, delete on table rate_details to authenticated;

-- ============================================================
-- 4. Rename recommendations -> recommendation, re-key FK,
--    drop unused notes column
-- ============================================================
alter table recommendations rename to recommendation;
alter table recommendation rename column project_id to client_requirement_id;
alter table recommendation drop column notes;

-- ============================================================
-- 5. Drop deferred-upload tables and their storage policies
-- ============================================================
drop table provider_documents;
drop table documents;

drop policy if exists "Authenticated users can delete provider files from storage" on storage.objects;
drop policy if exists "Only project owner can delete client requirement documents" on storage.objects;
drop policy if exists "Authenticated users can upload to 3pl-sourcing-documents" on storage.objects;
drop policy if exists "Authenticated users can view 3pl-sourcing-documents" on storage.objects;

-- ============================================================
-- 6. updated_at auto-trigger, shared by both tables
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger three_pl_providers_set_updated_at
  before update on three_pl_providers
  for each row execute function set_updated_at();

create trigger rate_details_set_updated_at
  before update on rate_details
  for each row execute function set_updated_at();
