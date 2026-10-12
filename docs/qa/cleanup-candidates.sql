-- Production cleanup candidates (client dashboard plan, Phase 0, section 12).
--
-- READ-ONLY: a single SELECT that changes nothing. Paste the whole file into
-- the Supabase SQL Editor and run it (the editor shows only the last result,
-- so it is one statement). Review the list, then delete through the app:
-- Administration for users and clients, the project pages for projects.
-- Never delete with SQL on production.
--
-- Rows come out in deletion order (forwarder projects, 3PL projects, clients,
-- users): a client can't be deleted while it has projects, and a user who
-- owns projects must have them reassigned first. The reason column says so.
--
-- What counts as a candidate:
--   test-like name   a word starting with "test" or "zz", "deploy check",
--                    "regression" or "justtesting" (case-insensitive; "Contest"
--                    and "Pizza" don't match)
--   users            no name, or a test-like name or email
--   clients          test-like name, or no projects in either module
--   projects         test-like client or owner; a 3PL project with fewer
--                    than 2 3PLs or a forwarder project with fewer than 2
--                    quotes; no baseline (3PL: no incumbent, or an incumbent
--                    with no costs; forwarder: current freight cost blank)
--   keep list        clients whose names start with Pakkable, Loom & Fray,
--                    Cascade Outdoor Gear, Cascade Roasting or Voltframe are
--                    flagged "KEEP LIST", not hidden.

with
params as (
  select '(\mtest|\mzz|deploy[[:space:]_-]*check|regression|justtesting)'::text as re,
         '^[[:space:]]*(pakkable|loom[[:space:]]*(&|and)[[:space:]]*fray|cascade outdoor gear|cascade roasting|voltframe)'::text as keep
),
people as (
  select u.id, u.email, u.created_at,
         nullif(btrim(u.raw_app_meta_data ->> 'first_name'), '') as first_name,
         coalesce(nullif(btrim(u.raw_app_meta_data ->> 'first_name'), ''), '(no name)') || ' (' || u.email || ')' as label
  from auth.users u
),
tpl as (
  select p.id, c.name as client_name, p.owner_id, p.date_created as created_at,
         c.name || ' · 3PL · ' || coalesce(p.target_geography, 'no geography') as name,
         (select count(*) from public.three_pl_providers v where v.three_pl_project_id = p.id) as providers,
         exists (select 1 from public.three_pl_providers v where v.three_pl_project_id = p.id and v.is_incumbent) as has_incumbent,
         exists (select 1 from public.three_pl_providers v
                 where v.three_pl_project_id = p.id and v.is_incumbent
                   and coalesce(v.storage_cost, v.pick_pack_cost, v.receiving_cost, v.returns_cost, v.system_setup_cost,
                                v.inventory_on_request_cost, v.adhoc_bundling_kitting_cost, v.adhoc_labelling_cost,
                                v.b2b_pick_pack_cost) is not null) as has_baseline
  from public.three_pl_projects p
  join public.clients c on c.id = p.client_id
),
fwd as (
  select p.id, c.name as client_name, p.owner_id, p.created_at, p.current_freight_cost_usd,
         c.name || ' · Forwarder · ' || coalesce(p.origin_city, p.origin_country, '?') || ' → '
           || coalesce(p.destination_city, p.destination_country, '?') as name,
         (select count(*) from public.forwarder_quotes q join public.forwarders f on f.id = q.forwarder_id
          where f.forwarder_project_id = p.id) as quotes
  from public.forwarder_projects p
  join public.clients c on c.id = p.client_id
),
candidates as (
  select 1 as ord, 'forwarder_project' as kind, f.id, f.name, o.label as owner, f.created_at,
         array_remove(array[
           case when f.client_name ~* params.re then 'client name looks like a test' end,
           case when o.first_name ~* params.re or o.email ~* params.re then 'owner looks like a test account' end,
           case when f.quotes < 2 then f.quotes || ' quote(s)' end,
           case when f.current_freight_cost_usd is null then 'no baseline (current freight cost blank)' end
         ], null) as reasons,
         f.client_name ~* params.keep as on_keep_list
  from fwd f cross join params left join people o on o.id = f.owner_id
  union all
  select 2, '3pl_project', t.id, t.name, o.label, t.created_at,
         array_remove(array[
           case when t.client_name ~* params.re then 'client name looks like a test' end,
           case when o.first_name ~* params.re or o.email ~* params.re then 'owner looks like a test account' end,
           case when t.providers < 2 then t.providers || ' 3PL(s)' end,
           case when not t.has_incumbent then 'no baseline (no incumbent 3PL)'
                when not t.has_baseline then 'no baseline (incumbent has no costs)' end
         ], null),
         t.client_name ~* params.keep
  from tpl t cross join params left join people o on o.id = t.owner_id
  union all
  select 3, 'client', c.id, c.name, null, c.created_at,
         array_remove(array[
           case when c.name ~* params.re then 'name looks like a test' end,
           case when not exists (select 1 from public.three_pl_projects p where p.client_id = c.id)
                 and not exists (select 1 from public.forwarder_projects p where p.client_id = c.id)
                then 'no projects in either module' end
         ], null),
         c.name ~* params.keep
  from public.clients c cross join params
  union all
  select 4, 'user', u.id, u.label, null, u.created_at,
         array_remove(array[
           case when u.first_name is null then 'no name' end,
           case when u.first_name ~* params.re then 'name looks like a test' end,
           case when u.email ~* params.re then 'email looks like a test' end
         ], null),
         false
  from people u cross join params
)
select c.kind, c.id, c.name, c.owner, c.created_at,
       array_to_string(c.reasons, '; ')
         || case when c.on_keep_list then '; KEEP LIST: check before deleting' else '' end
         || case when c.kind = 'user' and owned.n > 0 then '; owns ' || owned.n || ' project(s): reassign first' else '' end
         || case when c.kind = 'client' and used.n > 0 then '; has ' || used.n || ' project(s): delete those first' else '' end
         as reason
from candidates c
left join lateral (
  select (select count(*) from public.three_pl_projects p where p.owner_id = c.id)
       + (select count(*) from public.forwarder_projects p where p.owner_id = c.id) as n
) owned on c.kind = 'user'
left join lateral (
  select (select count(*) from public.three_pl_projects p where p.client_id = c.id)
       + (select count(*) from public.forwarder_projects p where p.client_id = c.id) as n
) used on c.kind = 'client'
where cardinality(c.reasons) > 0
order by c.ord, c.created_at;
