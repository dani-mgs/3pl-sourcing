-- Display names are set by admins only (QA regression 2026-10-09, B-3).
--
-- The name lived in raw_user_meta_data.first_name, which any signed-in user
-- can rewrite about themselves with auth.updateUser, and the sync trigger
-- copied it into profiles. So anyone could rename themselves, e.g. to an
-- admin's name. It now lives in raw_app_meta_data.first_name, like role and
-- tariff_editor: only the service role can write app_metadata, and the app
-- does that only after an admin check (updateUserDisplayName, createUser).
--
-- profiles.first_name stays, still a mirror kept by this trigger, so nothing
-- that reads it changes. raw_user_meta_data is left as it is; nothing reads
-- it any more.

create or replace function public.handle_new_or_updated_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, role, tariff_editor)
  values (
    new.id,
    new.email,
    new.raw_app_meta_data ->> 'first_name',
    coalesce(new.raw_app_meta_data ->> 'role', 'logistics_expert'),
    coalesce(new.raw_app_meta_data ->> 'tariff_editor', 'false') = 'true'
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        role = excluded.role,
        tariff_editor = excluded.tariff_editor;
  return new;
end;
$$;

-- Backfill: every existing name, exactly as it is (blank included), moves to
-- app_metadata, unless one is already there. The update fires the trigger
-- above, which writes the same name back to profiles. Neither auth.users nor
-- profiles has an updated_at trigger to disable.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('first_name', raw_user_meta_data ->> 'first_name')
where raw_user_meta_data ->> 'first_name' is not null
  and not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'first_name');
