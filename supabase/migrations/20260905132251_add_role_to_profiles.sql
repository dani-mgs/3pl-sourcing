alter table profiles add column role text not null default 'logistics_expert';

-- Update the existing sync trigger function to also sync role from
-- auth.users' app_metadata (keep whatever it currently does for
-- id/email/first_name, just add role to the same INSERT/UPDATE logic)
create or replace function public.handle_new_or_updated_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    coalesce(new.raw_app_meta_data ->> 'role', 'logistics_expert')
  )
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        role = excluded.role;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill existing profiles rows from their current auth.users state
update profiles p
set role = coalesce(u.raw_app_meta_data->>'role', 'logistics_expert')
from auth.users u
where u.id = p.id;

grant select, update on table profiles to authenticated;
