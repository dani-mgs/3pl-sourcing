alter table three_pl_providers
  add column currency text not null default 'USD'
    check (currency in ('USD','EUR','GBP','CNY','JPY','CAD','AUD','MXN','INR','PHP','VND','THB','HKD','SGD')),
  add column system_setup_cost numeric(12,2),
  add column inventory_on_request_cost numeric(12,2),
  add column adhoc_bundling_kitting_cost numeric(12,2),
  add column adhoc_labelling_cost numeric(12,2),
  add column b2b_pick_pack_cost numeric(12,2);
