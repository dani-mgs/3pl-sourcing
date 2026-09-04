-- ============================================================
-- profiles: a public mirror of the auth.users fields the app
-- needs to display (email, first_name), kept in sync via
-- triggers, since the client can't query auth.users directly.
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text
);

alter table profiles enable row level security;

create policy "Authenticated users can view profiles"
  on profiles for select to authenticated
  using (true);

create or replace function public.handle_new_or_updated_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'first_name')
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_or_updated_user();

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_new_or_updated_user();

-- Backfill existing users so profiles isn't empty for accounts
-- created before this migration.
insert into public.profiles (id, email, first_name)
select id, email, raw_user_meta_data ->> 'first_name' from auth.users
on conflict (id) do update
  set email = excluded.email,
      first_name = excluded.first_name;
