alter table client_requirements add column updated_at timestamptz not null default now();

create trigger client_requirements_set_updated_at
  before update on client_requirements
  for each row execute function set_updated_at();
