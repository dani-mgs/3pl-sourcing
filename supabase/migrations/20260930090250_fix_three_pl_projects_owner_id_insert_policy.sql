-- The INSERT policy on three_pl_projects (created back when this table was
-- called "projects" and the policy itself named "Authenticated users can
-- create projects"; both the table and the policy name were carried through
-- two renames since: projects -> client_requirements -> three_pl_projects,
-- landing on its current name in 20260928071728_shared_clients_refactor.sql)
-- has always been `with check (true)`, letting any authenticated user
-- insert a row with an
-- arbitrary owner_id via a direct Supabase client call. The app itself
-- already sets owner_id server-side from the authenticated user
-- (src/app/(authenticated)/3pl-sourcing/new/actions.ts), so this is a
-- defense-in-depth fix against bypassing the app, not a behavior change for
-- normal use. Matches the pattern already used on forwarder_projects'
-- INSERT policy.
drop policy "Authenticated users can create 3PL projects" on three_pl_projects;

create policy "Authenticated users can create 3PL projects" on three_pl_projects
  for insert to authenticated
  with check (owner_id = auth.uid() or is_admin());

-- Dangling grant with no matching RLS policy: profiles has only ever had a
-- SELECT policy (20260904154300_add_profiles_table.sql). RLS is enabled on
-- profiles, so with no INSERT/UPDATE/DELETE policy ever created, this grant
-- is unreachable — every UPDATE is already rejected by RLS regardless of the
-- grant. Dropping it removes a permission that looks live but does nothing,
-- which could otherwise mislead a future reader into thinking self-service
-- profile updates work.
revoke update on table profiles from authenticated;
