alter table rate_details
  drop constraint rate_details_provider_id_fkey;

alter table rate_details
  add constraint rate_details_provider_id_fkey
    foreign key (provider_id) references three_pl_providers(id) on delete cascade;
