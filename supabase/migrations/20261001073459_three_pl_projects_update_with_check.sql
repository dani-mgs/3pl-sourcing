-- Make the 3PL project UPDATE policy's new-row check explicit, matching
-- forwarder_projects: after an update the row must still be the caller's, or
-- the caller must be an admin, so only admins can reassign ownership (/admin
-- does it through the admin's own session, so is_admin() lets it through).
--
-- No behaviour change: with no WITH CHECK, Postgres already applies an UPDATE
-- policy's USING expression to the new row too, so owners couldn't give a
-- project away before this either (pgTAP 02 passes on both schemas). Stating
-- it means the rule no longer depends on that default.

alter policy "Owner or admin can update 3PL projects" on three_pl_projects
  with check (owner_id = auth.uid() or is_admin());
