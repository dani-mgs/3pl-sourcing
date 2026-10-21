-- Landed Cost workspaces (Phase 2b): drafts that hold INPUTS ONLY. No duty,
-- fee, total or per-unit amount is stored; results are recalculated on the
-- server from these inputs every time (src/lib/landed-cost/). Locked
-- snapshots come later, in their own tables.
--
--   landed_cost_workspaces        a workspace: name, entry date, USD, owner, baseline
--   landed_cost_sku_lines         SKUs shared by every scenario (code, HTS, qty, duty qty)
--   landed_cost_scenarios         1-5 origin scenarios (origin, terms, freight)
--   landed_cost_scenario_items    per scenario x SKU line: FOB price and carton
--   landed_cost_other_costs       per scenario: free-form label + amount, max 20
--
-- Access: any staff member reads; only the workspace's owner or an admin
-- writes (child rows follow their workspace); clients and anon get nothing.
-- Every table has the restrictive "Requires a staff role" policy. No security
-- definer function: child-row policies read the parent workspace, which staff
-- can read under RLS. The owner is set on insert and can't be updated; key
-- columns (ids, workspace, scenario, SKU line) can't be updated either, so a
-- row never moves between workspaces.
--
-- Bounds match the parsers that read these inputs (Phase 1 and the batch duty
-- loader), and values are stored as plain numeric with scale checks, so a
-- value with too many decimals is refused rather than silently rounded:
--   quantity, pieces per carton   parseWholeNumber: 1 .. 999,999,999,999
--   FOB unit price                parseAmount(4) and the loader's entered value: > 0, 4 dp, < 1e12
--   entered value (qty x FOB)     the loader's positiveDecimal(2, 1e14): round(qty x FOB, 2) in (0, 1e14)
--   freight total, other cost     parseCents: >= 0, 2 dp, < 1e12
--   carton cm / kg / divisor      parseMeasure: > 0, 2 / 3 / 3 dp, < 1e6
--   duty quantity                 positiveDecimal(4, 1e12): > 0, 4 dp, < 1e12; unit a known rate unit
--   HTS code                      normalizeHtsCode: 8 or 10 digits, not chapter 00, 77, 98 or 99
--   origin                        isOriginCountry (ORIGIN_COUNTRY_CODES; no US)
--   labels and names              JavaScript trim() and .length (landed_cost_text_ok)
-- The origin and unit lists here are compared with the TypeScript lists by
-- src/lib/landed-cost/workspace-db-sync.test.ts.

-- ---- Helpers (security invoker, immutable) ------------------------------------------

-- Trimmed as JavaScript's String.prototype.trim() leaves it, and between
-- p_min and p_max UTF-16 code units long (JavaScript's .length): a character
-- outside the BMP counts twice.
create function public.landed_cost_text_ok(p_text text, p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text = btrim(p_text, E'\t\n\u000b\f\r                  　﻿')
    and char_length(p_text) + regexp_count(p_text, '[\U00010000-\U0010FFFF]') between p_min and p_max;
$$;

-- The entered value the duty loader receives for a line: qty x FOB rounded
-- half up to the cent, above zero and below 1e14.
create function public.landed_cost_entered_value_ok(p_quantity bigint, p_unit_price numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select round(p_quantity * p_unit_price, 2) > 0 and round(p_quantity * p_unit_price, 2) < 1e14;
$$;

revoke all on function public.landed_cost_text_ok(text, integer, integer) from public, anon;
revoke all on function public.landed_cost_entered_value_ok(bigint, numeric) from public, anon;
grant execute on function public.landed_cost_text_ok(text, integer, integer) to authenticated;
grant execute on function public.landed_cost_entered_value_ok(bigint, numeric) to authenticated;

-- ---- Tables --------------------------------------------------------------------------

create table public.landed_cost_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  name text not null
    constraint landed_cost_workspaces_name_check check (public.landed_cost_text_ok(name, 1, 120)),
  -- No range check: a draft's date ages. The loader checks it on each run.
  entry_date date not null,
  currency text not null default 'USD'
    constraint landed_cost_workspaces_currency_check check (currency = 'USD'),
  -- The baseline scenario (at most one, of this workspace: see the foreign
  -- key added below the scenarios table).
  baseline_scenario_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index landed_cost_workspaces_owner_id_idx on public.landed_cost_workspaces (owner_id);

create table public.landed_cost_sku_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.landed_cost_workspaces (id) on delete cascade,
  sku_code text not null
    constraint landed_cost_sku_lines_sku_code_check check (public.landed_cost_text_ok(sku_code, 1, 60)),
  description text
    constraint landed_cost_sku_lines_description_check check (public.landed_cost_text_ok(description, 1, 500)),
  -- Digits only, as normalizeHtsCode returns them.
  hts_code text not null
    constraint landed_cost_sku_lines_hts_code_check
    check (hts_code ~ '^([0-9]{8}|[0-9]{10})$' and left(hts_code, 2) not in ('00', '77', '98', '99')),
  quantity bigint not null
    constraint landed_cost_sku_lines_quantity_check check (quantity between 1 and 999999999999),
  -- Only for per-unit rates, in the rate's own unit (e.g. net kg, dozen);
  -- never derived from carton weight.
  duty_quantity numeric
    constraint landed_cost_sku_lines_duty_quantity_check
    check (duty_quantity > 0 and duty_quantity < 1e12 and scale(duty_quantity) <= 4),
  duty_quantity_unit text
    constraint landed_cost_sku_lines_duty_quantity_unit_check
    check (duty_quantity_unit in ('kg', 'clean kg', 'g', 't', 'liter', 'pf. liter', 'pf.liter', 'bbl', 'm', 'lin. m', 'm2', 'm3', 'pr.', 'doz.', 'gross', '1000', '1,000', 'thousand', 'each', 'head', 'article', 'pack')),
  sort_order integer not null default 0
    constraint landed_cost_sku_lines_sort_order_check check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landed_cost_sku_lines_duty_quantity_pair_check
    check ((duty_quantity is null) = (duty_quantity_unit is null)),
  constraint landed_cost_sku_lines_sku_code_unique unique (workspace_id, sku_code),
  constraint landed_cost_sku_lines_id_workspace_unique unique (id, workspace_id)
);

create table public.landed_cost_scenarios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.landed_cost_workspaces (id) on delete cascade,
  label text not null
    constraint landed_cost_scenarios_label_check check (public.landed_cost_text_ok(label, 1, 60)),
  origin_country text not null
    constraint landed_cost_scenarios_origin_country_check
    check (origin_country in ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')),
  supplier_name text
    constraint landed_cost_scenarios_supplier_name_check check (public.landed_cost_text_ok(supplier_name, 1, 120)),
  -- SUPPORTED_INCOTERMS: terms whose price excludes international freight.
  incoterm text not null
    constraint landed_cost_scenarios_incoterm_check check (incoterm in ('EXW', 'FCA', 'FAS', 'FOB')),
  shipment_mode text not null
    constraint landed_cost_scenarios_shipment_mode_check check (shipment_mode in ('Air', 'Sea', 'Road')),
  entry_type text not null default 'auto'
    constraint landed_cost_scenarios_entry_type_check check (entry_type in ('auto', 'formal')),
  -- Null until entered.
  freight_total_usd numeric
    constraint landed_cost_scenarios_freight_total_check
    check (freight_total_usd >= 0 and freight_total_usd < 1e12 and scale(freight_total_usd) <= 2),
  freight_basis text not null default 'chargeable_weight'
    constraint landed_cost_scenarios_freight_basis_check check (freight_basis in ('chargeable_weight', 'value', 'units')),
  -- cm3 per kg; null = the mode's default (DIVISOR_DEFAULTS).
  volumetric_divisor numeric
    constraint landed_cost_scenarios_volumetric_divisor_check
    check (volumetric_divisor > 0 and volumetric_divisor < 1e6 and scale(volumetric_divisor) <= 3),
  sort_order integer not null default 0
    constraint landed_cost_scenarios_sort_order_check check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landed_cost_scenarios_label_unique unique (workspace_id, label),
  constraint landed_cost_scenarios_id_workspace_unique unique (id, workspace_id)
);

-- The baseline belongs to the same workspace; deleting it clears it.
alter table public.landed_cost_workspaces
  add constraint landed_cost_workspaces_baseline_fkey
  foreign key (baseline_scenario_id, id) references public.landed_cost_scenarios (id, workspace_id)
  on delete set null (baseline_scenario_id);

-- Per scenario and SKU line. The composite foreign keys make a row that mixes
-- two workspaces impossible. Every input is nullable: a draft is saved before
-- it's complete, and the calculation reports what's missing.
create table public.landed_cost_scenario_items (
  workspace_id uuid not null,
  scenario_id uuid not null,
  sku_line_id uuid not null,
  fob_unit_price_usd numeric
    constraint landed_cost_scenario_items_fob_check
    check (fob_unit_price_usd > 0 and fob_unit_price_usd < 1e12 and scale(fob_unit_price_usd) <= 4),
  pcs_per_carton bigint
    constraint landed_cost_scenario_items_pcs_check check (pcs_per_carton between 1 and 999999999999),
  carton_length_cm numeric
    constraint landed_cost_scenario_items_length_check
    check (carton_length_cm > 0 and carton_length_cm < 1e6 and scale(carton_length_cm) <= 2),
  carton_width_cm numeric
    constraint landed_cost_scenario_items_width_check
    check (carton_width_cm > 0 and carton_width_cm < 1e6 and scale(carton_width_cm) <= 2),
  carton_height_cm numeric
    constraint landed_cost_scenario_items_height_check
    check (carton_height_cm > 0 and carton_height_cm < 1e6 and scale(carton_height_cm) <= 2),
  carton_gross_kg numeric
    constraint landed_cost_scenario_items_kg_check
    check (carton_gross_kg > 0 and carton_gross_kg < 1e6 and scale(carton_gross_kg) <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scenario_id, sku_line_id),
  constraint landed_cost_scenario_items_workspace_fkey
    foreign key (workspace_id) references public.landed_cost_workspaces (id) on delete cascade,
  constraint landed_cost_scenario_items_scenario_fkey
    foreign key (scenario_id, workspace_id) references public.landed_cost_scenarios (id, workspace_id) on delete cascade,
  constraint landed_cost_scenario_items_sku_line_fkey
    foreign key (sku_line_id, workspace_id) references public.landed_cost_sku_lines (id, workspace_id) on delete cascade
);

create index landed_cost_scenario_items_sku_line_idx on public.landed_cost_scenario_items (sku_line_id);
create index landed_cost_scenario_items_workspace_idx on public.landed_cost_scenario_items (workspace_id);

create table public.landed_cost_other_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.landed_cost_workspaces (id) on delete cascade,
  scenario_id uuid not null,
  label text not null
    constraint landed_cost_other_costs_label_check check (public.landed_cost_text_ok(label, 1, 100)),
  amount_usd numeric not null
    constraint landed_cost_other_costs_amount_check
    check (amount_usd >= 0 and amount_usd < 1e12 and scale(amount_usd) <= 2),
  sort_order integer not null default 0
    constraint landed_cost_other_costs_sort_order_check check (sort_order between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landed_cost_other_costs_scenario_fkey
    foreign key (scenario_id, workspace_id) references public.landed_cost_scenarios (id, workspace_id) on delete cascade
);

create index landed_cost_sku_lines_workspace_idx on public.landed_cost_sku_lines (workspace_id);
create index landed_cost_scenarios_workspace_idx on public.landed_cost_scenarios (workspace_id);
create index landed_cost_other_costs_scenario_idx on public.landed_cost_other_costs (scenario_id);
create index landed_cost_other_costs_workspace_idx on public.landed_cost_other_costs (workspace_id);

-- ---- Triggers ------------------------------------------------------------------------

create trigger landed_cost_workspaces_set_updated_at
  before update on public.landed_cost_workspaces for each row execute function public.set_updated_at();
create trigger landed_cost_sku_lines_set_updated_at
  before update on public.landed_cost_sku_lines for each row execute function public.set_updated_at();
create trigger landed_cost_scenarios_set_updated_at
  before update on public.landed_cost_scenarios for each row execute function public.set_updated_at();
create trigger landed_cost_scenario_items_set_updated_at
  before update on public.landed_cost_scenario_items for each row execute function public.set_updated_at();
create trigger landed_cost_other_costs_set_updated_at
  before update on public.landed_cost_other_costs for each row execute function public.set_updated_at();

-- Row limits: 100 SKU lines and 5 scenarios per workspace, 20 other costs per
-- scenario. The workspace's advisory lock makes concurrent inserts wait their
-- turn, so two can't both pass the count. Runs as the writer, who is staff
-- and so sees every row counted.
create function public.landed_cost_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));
  if tg_table_name = 'landed_cost_sku_lines' then
    select count(*) into v_count from public.landed_cost_sku_lines where workspace_id = new.workspace_id;
    if v_count >= 100 then
      raise exception 'A workspace can have at most 100 SKU lines.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'landed_cost_scenarios' then
    select count(*) into v_count from public.landed_cost_scenarios where workspace_id = new.workspace_id;
    if v_count >= 5 then
      raise exception 'A workspace can have at most 5 scenarios.' using errcode = '23514';
    end if;
  else
    select count(*) into v_count from public.landed_cost_other_costs where scenario_id = new.scenario_id;
    if v_count >= 20 then
      raise exception 'A scenario can have at most 20 other costs.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger landed_cost_sku_lines_row_limit
  before insert on public.landed_cost_sku_lines for each row execute function public.landed_cost_row_limit();
create trigger landed_cost_scenarios_row_limit
  before insert on public.landed_cost_scenarios for each row execute function public.landed_cost_row_limit();
create trigger landed_cost_other_costs_row_limit
  before insert on public.landed_cost_other_costs for each row execute function public.landed_cost_row_limit();

-- The entered value (qty x FOB) must be one the duty loader accepts. qty and
-- FOB are in two tables, so a check constraint can't see both: the item
-- trigger checks a new price, the SKU line trigger a new quantity.
create function public.landed_cost_item_value_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quantity bigint;
begin
  if new.fob_unit_price_usd is null then
    return new;
  end if;
  select l.quantity into v_quantity from public.landed_cost_sku_lines l where l.id = new.sku_line_id;
  if v_quantity is not null and not public.landed_cost_entered_value_ok(v_quantity, new.fob_unit_price_usd) then
    raise exception 'Quantity x FOB price must come to more than $0.00 and less than $100 trillion.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.landed_cost_sku_quantity_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.landed_cost_scenario_items i
    where i.sku_line_id = new.id and i.fob_unit_price_usd is not null
      and not public.landed_cost_entered_value_ok(new.quantity, i.fob_unit_price_usd)
  ) then
    raise exception 'Quantity x FOB price must come to more than $0.00 and less than $100 trillion.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger landed_cost_scenario_items_value_check
  before insert or update of fob_unit_price_usd on public.landed_cost_scenario_items
  for each row execute function public.landed_cost_item_value_check();
create trigger landed_cost_sku_lines_quantity_check
  before update of quantity on public.landed_cost_sku_lines
  for each row execute function public.landed_cost_sku_quantity_check();

revoke all on function public.landed_cost_row_limit() from public, anon, authenticated;
revoke all on function public.landed_cost_item_value_check() from public, anon, authenticated;
revoke all on function public.landed_cost_sku_quantity_check() from public, anon, authenticated;

-- ---- Row level security ----------------------------------------------------------------

alter table public.landed_cost_workspaces enable row level security;
alter table public.landed_cost_sku_lines enable row level security;
alter table public.landed_cost_scenarios enable row level security;
alter table public.landed_cost_scenario_items enable row level security;
alter table public.landed_cost_other_costs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['landed_cost_workspaces', 'landed_cost_sku_lines', 'landed_cost_scenarios',
                           'landed_cost_scenario_items', 'landed_cost_other_costs'] loop
    execute format(
      'create policy "Requires a staff role" on public.%I as restrictive for all to authenticated '
      'using ((select public.has_staff_role())) with check ((select public.has_staff_role()))', t);
    execute format('create policy "Staff can read landed cost data" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- The workspace: created by and for the signed-in user; changed or removed by
-- its owner or an admin.
create policy "Users create their own workspaces" on public.landed_cost_workspaces
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owner or admin can update workspaces" on public.landed_cost_workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "Owner or admin can delete workspaces" on public.landed_cost_workspaces
  for delete to authenticated using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- Child rows: written by the owner of their workspace or an admin.
do $$
declare
  t text;
  v_check constant text :=
    'exists (select 1 from public.landed_cost_workspaces w where w.id = workspace_id '
    'and (w.owner_id = (select auth.uid()) or (select public.is_admin())))';
begin
  foreach t in array array['landed_cost_sku_lines', 'landed_cost_scenarios', 'landed_cost_scenario_items',
                           'landed_cost_other_costs'] loop
    execute format('create policy "Workspace owner or admin can insert" on public.%I for insert to authenticated with check (%s)', t, v_check);
    execute format('create policy "Workspace owner or admin can update" on public.%I for update to authenticated using (%s) with check (%s)', t, v_check, v_check);
    execute format('create policy "Workspace owner or admin can delete" on public.%I for delete to authenticated using (%s)', t, v_check);
  end loop;
end $$;

-- ---- Privileges --------------------------------------------------------------------------
-- Update only on the inputs: never ids, owner, workspace, scenario, SKU line,
-- currency or created_at. No service_role grants: nothing uses it here.

revoke all on table public.landed_cost_workspaces, public.landed_cost_sku_lines, public.landed_cost_scenarios,
  public.landed_cost_scenario_items, public.landed_cost_other_costs from public, anon, authenticated;

grant select, insert, delete on table public.landed_cost_workspaces, public.landed_cost_sku_lines,
  public.landed_cost_scenarios, public.landed_cost_scenario_items, public.landed_cost_other_costs to authenticated;

grant update (name, entry_date, baseline_scenario_id) on public.landed_cost_workspaces to authenticated;
grant update (sku_code, description, hts_code, quantity, duty_quantity, duty_quantity_unit, sort_order)
  on public.landed_cost_sku_lines to authenticated;
grant update (label, origin_country, supplier_name, incoterm, shipment_mode, entry_type, freight_total_usd,
  freight_basis, volumetric_divisor, sort_order) on public.landed_cost_scenarios to authenticated;
grant update (fob_unit_price_usd, pcs_per_carton, carton_length_cm, carton_width_cm, carton_height_cm,
  carton_gross_kg) on public.landed_cost_scenario_items to authenticated;
grant update (label, amount_usd, sort_order) on public.landed_cost_other_costs to authenticated;
