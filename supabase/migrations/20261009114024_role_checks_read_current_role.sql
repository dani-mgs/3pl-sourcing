-- Role checks read the current role, not the caller's token.
--
-- is_admin() and is_tariff_editor() read app_metadata from the JWT, which is
-- only rebuilt when the user signs in or the token refreshes (up to an hour).
-- A demoted admin or revoked tariff editor kept write access through the API
-- with an old token, and a promoted user's saves failed until they signed in
-- again (QA regression 2026-10-09, B-1 and B-2). The app's pages already read
-- the current role through getUser(), which asks the auth server.
--
-- Both now read auth.users.raw_app_meta_data for auth.uid(): the same source
-- as getUser() and is_admin_user(), written only by admins through the
-- service role. Never raw_user_meta_data, which users can edit themselves.
-- A missing user (deleted, or a token for no one) is neither.
--
-- create or replace keeps each function's identity, so every policy that
-- calls them picks this up unchanged. security definer lets them read
-- auth.users, which signed-in users can't.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' = 'admin'
     from auth.users u
     where u.id = auth.uid()),
    false);
$$;

create or replace function public.is_tariff_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'tariff_editor' = 'true'
         or u.raw_app_meta_data ->> 'role' = 'admin'
     from auth.users u
     where u.id = auth.uid()),
    false);
$$;

-- Policies run them as the signed-in user, so authenticated keeps EXECUTE.
-- Each answers only for the caller.
revoke all on function public.is_admin(), public.is_tariff_editor() from public, anon;
grant execute on function public.is_admin(), public.is_tariff_editor() to authenticated, service_role;
