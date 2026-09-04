-- ============================================================
-- Shared helper: is the current user an admin?
-- ============================================================
create or replace function is_admin()
returns boolean as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$ language sql stable;

-- ============================================================
-- client_requirements: reads stay open, writes owner-or-admin
-- ============================================================
drop policy "Authenticated users can update projects" on client_requirements;

create policy "Owner or admin can update client requirements"
  on client_requirements for update to authenticated
  using (owner_id = auth.uid() or is_admin());

-- (SELECT and INSERT policies unchanged — reads stay open,
-- any authenticated user can still create a new client_requirements
-- row and becomes its owner)

-- ============================================================
-- three_pl_providers: reads stay open, writes owner-or-admin
-- via the parent client_requirements' owner_id
-- ============================================================
drop policy "Authenticated users can insert providers" on three_pl_providers;
drop policy "Authenticated users can update providers" on three_pl_providers;
drop policy "Authenticated users can delete providers" on three_pl_providers;

create policy "Owner or admin can insert providers"
  on three_pl_providers for insert to authenticated
  with check (
    exists (
      select 1 from client_requirements
      where client_requirements.id = three_pl_providers.client_requirement_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

create policy "Owner or admin can update providers"
  on three_pl_providers for update to authenticated
  using (
    exists (
      select 1 from client_requirements
      where client_requirements.id = three_pl_providers.client_requirement_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

create policy "Owner or admin can delete providers"
  on three_pl_providers for delete to authenticated
  using (
    exists (
      select 1 from client_requirements
      where client_requirements.id = three_pl_providers.client_requirement_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- rate_details: reads stay open, writes owner-or-admin via
-- provider -> client_requirements chain
-- ============================================================
drop policy "Authenticated users can insert rate details" on rate_details;
drop policy "Authenticated users can update rate details" on rate_details;
drop policy "Authenticated users can delete rate details" on rate_details;

create policy "Owner or admin can insert rate details"
  on rate_details for insert to authenticated
  with check (
    exists (
      select 1 from three_pl_providers
      join client_requirements on client_requirements.id = three_pl_providers.client_requirement_id
      where three_pl_providers.id = rate_details.provider_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

create policy "Owner or admin can update rate details"
  on rate_details for update to authenticated
  using (
    exists (
      select 1 from three_pl_providers
      join client_requirements on client_requirements.id = three_pl_providers.client_requirement_id
      where three_pl_providers.id = rate_details.provider_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

create policy "Owner or admin can delete rate details"
  on rate_details for delete to authenticated
  using (
    exists (
      select 1 from three_pl_providers
      join client_requirements on client_requirements.id = three_pl_providers.client_requirement_id
      where three_pl_providers.id = rate_details.provider_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

-- ============================================================
-- recommendation: reads stay open, writes owner-or-admin
-- ============================================================
drop policy "Authenticated users can insert recommendations" on recommendation;
drop policy "Authenticated users can update recommendations" on recommendation;

create policy "Owner or admin can insert recommendation"
  on recommendation for insert to authenticated
  with check (
    exists (
      select 1 from client_requirements
      where client_requirements.id = recommendation.client_requirement_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );

create policy "Owner or admin can update recommendation"
  on recommendation for update to authenticated
  using (
    exists (
      select 1 from client_requirements
      where client_requirements.id = recommendation.client_requirement_id
      and (client_requirements.owner_id = auth.uid() or is_admin())
    )
  );
