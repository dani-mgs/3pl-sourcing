-- Forwarder Audit (Phase B): one row per audit, holding the INPUTS ONLY (the
-- Audit sheet's sections 1-4 as a JSON object). Nothing calculated is stored:
-- status, totals and findings are recalculated by src/lib/forwarder-audit/
-- every time an audit is opened, as in Landed Cost.
--
-- Access: any staff member reads; only the audit's owner or an admin updates
-- or deletes it; clients and anon get nothing. The restrictive "Requires a
-- staff role" policy applies, as on every internal table. No security
-- definer function and no service_role privilege: nothing here needs them.
-- The owner is set on insert and can't be updated (update is granted on
-- `inputs` only), so a row never changes hands.

create table public.forwarder_audits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  inputs jsonb not null
    constraint forwarder_audits_inputs_check
    check (jsonb_typeof(inputs) = 'object' and octet_length(inputs::text) <= 200000),
  template_version text not null default '1.0'
    constraint forwarder_audits_template_version_check check (template_version = '1.0'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index forwarder_audits_owner_id_idx on public.forwarder_audits (owner_id);
create index forwarder_audits_updated_at_idx on public.forwarder_audits (updated_at desc);

create trigger forwarder_audits_set_updated_at
  before update on public.forwarder_audits for each row execute function public.set_updated_at();

alter table public.forwarder_audits enable row level security;

create policy "Requires a staff role" on public.forwarder_audits
  as restrictive for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy "Staff can read forwarder audits" on public.forwarder_audits
  for select to authenticated using (true);
create policy "Users create their own forwarder audits" on public.forwarder_audits
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owner or admin can update forwarder audits" on public.forwarder_audits
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "Owner or admin can delete forwarder audits" on public.forwarder_audits
  for delete to authenticated using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- ---- Privileges ---------------------------------------------------------------------------
revoke all on table public.forwarder_audits from public, anon, authenticated, service_role;
grant select, delete on table public.forwarder_audits to authenticated;
grant insert (id, owner_id, inputs, template_version) on public.forwarder_audits to authenticated;
grant update (inputs) on public.forwarder_audits to authenticated;
