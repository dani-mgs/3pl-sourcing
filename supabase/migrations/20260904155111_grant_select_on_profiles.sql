-- The previous migration created an RLS policy on profiles but never
-- granted the underlying table-level SELECT privilege, which Postgres
-- requires independently of RLS — every authenticated request failed
-- with "permission denied for table profiles".
grant select on public.profiles to authenticated;
