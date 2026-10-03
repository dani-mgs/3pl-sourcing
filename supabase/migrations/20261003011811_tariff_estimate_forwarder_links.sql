-- Duty estimates linked to a forwarder project, and optionally to one of its
-- quotes ("Estimate duties" from Forwarder Sourcing).
--
-- A linked estimate keeps a snapshot of the project and quote values it was
-- built from (input_snapshot), so the pages can show what changed since. The
-- estimate itself stays locked like every other saved estimate.
--
-- Only the project's owner or an admin can save an estimate linked to it.
-- Unlinked estimates are unchanged: any signed-in user saves their own.
--
-- Deleting the project or quote deletes its linked estimates (a cascade is a
-- delete, which the lock trigger allows; "set null" would be an update).

alter table duty_estimates
  add column forwarder_project_id uuid
    references forwarder_projects(id) on delete cascade,
  add column forwarder_quote_id uuid
    references forwarder_quotes(id) on delete cascade,
  -- { project: {...}, quote: {...} | null, choices: {...} }; see
  -- src/lib/tariff/forwarder-link.ts for the fields.
  add column input_snapshot jsonb,
  -- International freight and insurance taken out of a delivered-terms
  -- invoice price (CIF, CFR, CPT, CIP, DAP, DPU, DDP, DDU), confirmed by the
  -- user. customs_value_usd is the converted invoice value less this amount.
  add column freight_insurance_deduction_usd numeric(14,2)
    constraint duty_estimates_deduction_check check (freight_insurance_deduction_usd > 0),
  add constraint duty_estimates_quote_needs_project_check
    check (forwarder_quote_id is null or forwarder_project_id is not null),
  add constraint duty_estimates_snapshot_check
    check ((forwarder_project_id is null) = (input_snapshot is null)
      and (input_snapshot is null or jsonb_typeof(input_snapshot) = 'object')),
  add constraint duty_estimates_deduction_linked_check
    check (freight_insurance_deduction_usd is null or forwarder_project_id is not null);

create index duty_estimates_forwarder_project_id_idx on duty_estimates (forwarder_project_id);
create index duty_estimates_forwarder_quote_id_idx on duty_estimates (forwarder_quote_id);

-- The quote must belong to the linked project, whoever inserts the row.
create function duty_estimates_check_quote_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.forwarder_quote_id is not null and not exists (
    select 1
    from public.forwarder_quotes q
    join public.forwarders f on f.id = q.forwarder_id
    where q.id = new.forwarder_quote_id
      and f.forwarder_project_id = new.forwarder_project_id
  ) then
    raise exception 'The quote does not belong to the linked forwarder project.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger duty_estimates_quote_project
  before insert on duty_estimates
  for each row execute function duty_estimates_check_quote_project();

drop policy "Users can save their own duty estimates" on duty_estimates;

create policy "Users can save their own duty estimates"
  on duty_estimates for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      forwarder_project_id is null
      or exists (
        select 1 from forwarder_projects fp
        where fp.id = duty_estimates.forwarder_project_id
          and (fp.owner_id = auth.uid() or is_admin())
      )
    )
  );
