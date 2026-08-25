alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

create table "public"."documents" (
  "id"          uuid                     not null default gen_random_uuid(),
  "project_id"  uuid                     not null,
  "type"        text                     not null,
  "file_path"   text                     not null,
  "file_name"   text                     not null,
  "uploaded_by" uuid                     not null,
  "uploaded_at" timestamp with time zone not null default now(),
  "summary"     text,
  constraint "documents_pkey" primary key (id),
  constraint "documents_type_check" check ((type = ANY (ARRAY['rfi'::text, 'kickoff_transcript'::text, 'other'::text])))
);

alter table "public"."documents"
  enable row level security;

create table "public"."projects" (
  "id"           uuid                     not null default gen_random_uuid(),
  "client_name"  text                     not null,
  "project_name" text                     not null,
  "owner_id"     uuid                     not null,
  "date_created" timestamp with time zone not null default now(),
  "status"       text                     not null default 'Active'::text,
  constraint "projects_pkey" primary key (id)
);

alter table "public"."projects"
  enable row level security;

create table "public"."provider_documents" (
  "id"          uuid                     not null default gen_random_uuid(),
  "provider_id" uuid                     not null,
  "type"        text                     not null,
  "file_path"   text                     not null,
  "file_name"   text                     not null,
  "uploaded_by" uuid                     not null,
  "uploaded_at" timestamp with time zone not null default now(),
  constraint "provider_documents_pkey" primary key (id),
  constraint "provider_documents_type_check"
    check ((type = ANY (ARRAY['discovery_transcript'::text, 'notes'::text, 'document'::text, 'quotation'::text, 'revised_quotation'::text])))
);

alter table "public"."provider_documents"
  enable row level security;

create table "public"."providers" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "project_id"         uuid                     not null,
  "company_name"       text                     not null,
  "website"            text,
  "contact_person"     text,
  "email"              text,
  "phone"              text,
  "location"           text,
  "notes"              text,
  "status"             text                     not null default 'Potential'::text,
  "created_at"         timestamp with time zone not null default now(),
  "cost"               text,
  "service_capability" text,
  "turnaround_time"    text,
  constraint "providers_pkey" primary key (id),
  constraint "providers_status_check"
    check ((status = ANY (ARRAY['Potential'::text, 'Contacted'::text, 'Discovery Call'::text, 'Quotation Received'::text, 'Negotiation'::text, 'Vetted'::text, 'Rejected'::text])))
);

alter table "public"."providers"
  enable row level security;

create table "public"."recommendations" (
  "id"            uuid                     not null default gen_random_uuid(),
  "project_id"    uuid                     not null,
  "priority"      text                     not null,
  "provider_id_1" uuid,
  "provider_id_2" uuid,
  "provider_id_3" uuid,
  "notes"         text,
  "generated_at"  timestamp with time zone not null default now(),
  constraint "recommendations_pkey" primary key (id),
  constraint "recommendations_priority_check" check ((priority = ANY (ARRAY['Cost Savings'::text, 'Quality of Service'::text, 'Turnaround Time'::text]))),
  constraint "recommendations_project_id_key" unique (project_id)
);

alter table "public"."recommendations"
  enable row level security;

create table "public"."requirements_summary" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "project_id"           uuid                     not null,
  "location"             text,
  "storage_requirements" text,
  "order_volume"         text,
  "sku_count"            text,
  "b2b_or_b2c"           text,
  "special_handling"     text,
  "target_cost"          text,
  "turnaround_time"      text,
  "notes"                text,
  "updated_at"           timestamp with time zone not null default now(),
  constraint "requirements_summary_pkey" primary key (id),
  constraint "requirements_summary_project_id_key" unique (project_id)
);

alter table "public"."requirements_summary"
  enable row level security;

alter table "public"."documents"
  add constraint "documents_uploaded_by_fkey" foreign key (uploaded_by) references auth.users(id);

alter table "public"."projects"
  add constraint "projects_owner_id_fkey" foreign key (owner_id) references auth.users(id);

alter table "public"."documents"
  add constraint "documents_project_id_fkey" foreign key (project_id) references public.projects(id);

alter table "public"."provider_documents"
  add constraint "provider_documents_uploaded_by_fkey" foreign key (uploaded_by) references auth.users(id);

alter table "public"."provider_documents"
  add constraint "provider_documents_provider_id_fkey" foreign key (provider_id) references public.providers(id);

alter table "public"."providers"
  add constraint "providers_project_id_fkey" foreign key (project_id) references public.projects(id);

alter table "public"."recommendations"
  add constraint "recommendations_project_id_fkey" foreign key (project_id) references public.projects(id);

alter table "public"."recommendations"
  add constraint "recommendations_provider_id_1_fkey" foreign key (provider_id_1) references public.providers(id);

alter table "public"."recommendations"
  add constraint "recommendations_provider_id_2_fkey" foreign key (provider_id_2) references public.providers(id);

alter table "public"."recommendations"
  add constraint "recommendations_provider_id_3_fkey" foreign key (provider_id_3) references public.providers(id);

alter table "public"."requirements_summary"
  add constraint "requirements_summary_project_id_fkey" foreign key (project_id) references public.projects(id);

create policy "Authenticated users can insert documents" on "public"."documents"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can view all documents" on "public"."documents"
  for select
  to "authenticated"
  using (true);

create policy "Only project owner can delete documents" on "public"."documents"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.projects
  where ((projects.id = documents.project_id) AND (projects.owner_id = auth.uid())))));

create policy "Authenticated users can create projects" on "public"."projects"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can update projects" on "public"."projects"
  for update
  to "authenticated"
  using (true);

create policy "Authenticated users can view all projects" on "public"."projects"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can delete provider documents" on "public"."provider_documents"
  for delete
  to "authenticated"
  using (true);

create policy "Authenticated users can insert provider documents" on "public"."provider_documents"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can view all provider documents" on "public"."provider_documents"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can delete providers" on "public"."providers"
  for delete
  to "authenticated"
  using (true);

create policy "Authenticated users can insert providers" on "public"."providers"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can update providers" on "public"."providers"
  for update
  to "authenticated"
  using (true);

create policy "Authenticated users can view all providers" on "public"."providers"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can insert recommendations" on "public"."recommendations"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can update recommendations" on "public"."recommendations"
  for update
  to "authenticated"
  using (true);

create policy "Authenticated users can view recommendations" on "public"."recommendations"
  for select
  to "authenticated"
  using (true);

create policy "Authenticated users can insert requirements summaries" on "public"."requirements_summary"
  for insert
  to "authenticated"
  with check (true);

create policy "Authenticated users can update requirements summaries" on "public"."requirements_summary"
  for update
  to "authenticated"
  using (true);

create policy "Authenticated users can view requirements summaries" on "public"."requirements_summary"
  for select
  to "authenticated"
  using (true);

grant maintain, references, trigger, truncate on table "public"."documents" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."documents" to "authenticated", "postgres";

grant maintain, references, trigger, truncate on table "public"."documents" to "service_role";

grant maintain, references, trigger, truncate on table "public"."projects" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."projects" to "authenticated", "postgres";

grant maintain, references, trigger, truncate on table "public"."projects" to "service_role";

grant maintain, references, trigger, truncate on table "public"."provider_documents" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate on table "public"."provider_documents" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."provider_documents" to "postgres";

grant maintain, references, trigger, truncate on table "public"."provider_documents" to "service_role";

grant maintain, references, trigger, truncate on table "public"."providers" to "anon";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."providers" to "authenticated", "postgres";

grant maintain, references, trigger, truncate on table "public"."providers" to "service_role";

grant maintain, references, trigger, truncate on table "public"."recommendations" to "anon";

grant insert, maintain, references, select, trigger, truncate, update on table "public"."recommendations" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."recommendations" to "postgres";

grant maintain, references, trigger, truncate on table "public"."recommendations" to "service_role";

grant maintain, references, trigger, truncate on table "public"."requirements_summary" to "anon";

grant insert, maintain, references, select, trigger, truncate, update on table "public"."requirements_summary" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."requirements_summary" to "postgres";

grant maintain, references, trigger, truncate on table "public"."requirements_summary" to "service_role";

