-- Tariff editor: a narrow permission to maintain duty and fee data, on top of
-- a user's role (an editor stays a logistics_expert). Stored as
-- app_metadata.tariff_editor = true, which users can't edit themselves; only
-- admins grant or revoke it (in /admin, through the service role).
--
-- is_tariff_editor() is true for tariff editors and admins. It gates writes to
-- customs_fees here, and to additional_duties, additional_duty_scope and
-- duty_program_reviews in the next migration, and nothing else.

create or replace function is_tariff_editor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'tariff_editor') = 'true', false)
    or public.is_admin();
$$;

-- Mirror the flag on profiles so /admin and the duty-data pages can show who
-- is an editor. Kept in sync by the same trigger as role.
alter table profiles add column tariff_editor boolean not null default false;

create or replace function public.handle_new_or_updated_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, role, tariff_editor)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
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
$$ language plpgsql security definer set search_path = public;

-- Backfill (profiles has no updated_at trigger to disable).
update profiles p
set tariff_editor = coalesce(u.raw_app_meta_data ->> 'tariff_editor', 'false') = 'true'
from auth.users u
where u.id = p.id;

-- customs_fees: tariff editors (and admins) write; everyone signed in reads.
drop policy "Admins can insert customs fees" on customs_fees;
drop policy "Admins can update customs fees" on customs_fees;
drop policy "Admins can delete customs fees" on customs_fees;

create policy "Tariff editors can insert customs fees"
  on customs_fees for insert to authenticated with check (is_tariff_editor());
create policy "Tariff editors can update customs fees"
  on customs_fees for update to authenticated using (is_tariff_editor()) with check (is_tariff_editor());
create policy "Tariff editors can delete customs fees"
  on customs_fees for delete to authenticated using (is_tariff_editor());
