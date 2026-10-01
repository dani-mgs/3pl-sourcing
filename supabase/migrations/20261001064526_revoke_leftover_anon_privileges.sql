-- anon (signed-out requests) still held every table privilege on the tables
-- that predate the explicit "revoke all ... from anon" the newer migrations
-- do (clients, forwarder_*, fx_rates). RLS kept their rows hidden, since
-- every policy is "to authenticated", but TRUNCATE isn't subject to RLS and
-- nothing signed-out should touch these tables at all. Found by an inventory
-- of every public table's grants after a fresh reset:
--   profiles, rate_details, recommendation, three_pl_projects,
--   three_pl_providers — each had SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--   REFERENCES, TRIGGER, MAINTAIN.
-- authenticated and service_role grants are unchanged.

revoke all on table profiles from anon;
revoke all on table rate_details from anon;
revoke all on table recommendation from anon;
revoke all on table three_pl_projects from anon;
revoke all on table three_pl_providers from anon;
