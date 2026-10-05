-- HTS code lookup: keyword and code search over the current HTS release, to
-- help experts find candidate lines. It never classifies a product: results
-- come in code order, never ranked as a recommendation.
--
-- hts_lines.ancestor_text   the line's ancestor descriptions as one string,
--                           filled when a release is activated (and backfilled
--                           here for the current release), so a 10-digit line
--                           that only says "Other" is found by its parents'
--                           words
-- hts_lines.search_vector   English full-text vector over description and
--                           ancestor_text (generated, GIN-indexed)
-- search_hts_lines()        the search, read-only, for signed-in users

alter table hts_lines add column ancestor_text text;

-- One-time backfill of the release that is already current. hts_lines has no
-- updated_at trigger, so there is nothing to disable.
update hts_lines l
set ancestor_text = array_to_string(l.ancestor_descriptions, ' ')
from hts_releases r
where r.id = l.release_id and r.status = 'current';

alter table hts_lines
  add column search_vector tsvector
    generated always as (to_tsvector('english'::regconfig, description || ' ' || coalesce(ancestor_text, ''))) stored;

create index hts_lines_search_vector_idx on hts_lines using gin (search_vector);

-- For "which programs may apply" on a heading: scope rows under a code.
create index additional_duty_scope_hts_prefix_idx on additional_duty_scope (hts_prefix);

-- Same rules as before (20261002151200), plus: fill ancestor_text for the
-- release being activated, once every chapter is in and the counts check out.
create or replace function activate_hts_release(p_release_id uuid, p_expected_rows integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_release public.hts_releases%rowtype;
  v_previous uuid;
  v_stored integer;
begin
  select * into v_release from public.hts_releases where id = p_release_id for update;
  if not found then
    raise exception 'HTS release % not found', p_release_id;
  end if;
  if v_release.status <> 'importing' then
    raise exception 'HTS release % is %, not importing', v_release.name, v_release.status;
  end if;
  if v_release.next_chapter <> 100 then
    raise exception 'HTS release % is incomplete (next chapter %)', v_release.name, v_release.next_chapter;
  end if;

  select count(*) into v_stored from public.hts_lines where release_id = p_release_id;
  if v_stored <> p_expected_rows or v_stored <> v_release.row_count then
    raise exception 'HTS release % has % stored rows; expected %', v_release.name, v_stored, p_expected_rows;
  end if;

  update public.hts_lines
    set ancestor_text = array_to_string(ancestor_descriptions, ' ')
    where release_id = p_release_id;

  select id into v_previous from public.hts_releases where status = 'current';
  if v_previous is not null then
    insert into public.hts_chapter99_changes
      (release_id, release_name, hts_code, change, old_description, new_description, old_rate, new_rate)
    select p_release_id, v_release.name, coalesce(n.hts_code, o.hts_code),
      case when o.hts_code is null then 'added' when n.hts_code is null then 'removed' else 'changed' end,
      o.description, n.description, o.general_rate, n.general_rate
    from (select * from public.hts_lines where release_id = v_previous and chapter = '99') o
    full join (select * from public.hts_lines where release_id = p_release_id and chapter = '99') n
      on n.hts_code = o.hts_code
    where o.hts_code is null or n.hts_code is null
      or n.description is distinct from o.description
      or n.general_rate is distinct from o.general_rate;
  end if;

  update public.hts_releases set status = 'superseded' where status = 'current';
  update public.hts_releases
    set status = 'current', activated_at = now(), completed_at = coalesce(completed_at, now()),
        lease_until = null, last_error = null
    where id = p_release_id;

  delete from public.hts_lines
    where release_id in (
      select id from public.hts_releases where status in ('superseded', 'failed')
    );
end;
$$;

revoke all on function activate_hts_release(uuid, integer) from public, anon, authenticated;
grant execute on function activate_hts_release(uuid, integer) to service_role;

-- Lines of the current release matching every keyword (as a prefix, English
-- stemming), or the subtree under a code (2–10 digits), in code order. At
-- most p_limit rows (1–500); total_count is the number of matches before the
-- limit, so the page can ask for a narrower search.
--
-- Per line it also returns:
--   has_children  whether longer codes sit under it (an 8-digit line with
--              10-digit lines isn't a code the calculator can use)
--   parents    the numbered lines above it (heading, subheading, 8-digit),
--              [{code, description}], for the full path
--   may_apply  additional-duty programs that MAY apply by HTS code, with no
--              amounts: [{key, name, origins}], origins null for any origin.
--              A program matches when its HTS trigger covers the line, or
--              when one of its charging rows (not exempt, not expired) lists a
--              scope prefix covering the line or under it. Programs that
--              depend on origin alone aren't listed.
--
-- Runs as the caller (RLS applies); terms must be lowercase letters and
-- digits, which the app ensures, so they can't carry tsquery syntax.
create function search_hts_lines(p_terms text[] default null, p_code text default null, p_limit integer default 150)
returns table (
  hts_code text,
  indent smallint,
  description text,
  ancestor_descriptions text[],
  units text[],
  general_rate text,
  rate_from_code text,
  has_children boolean,
  parents jsonb,
  may_apply jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query tsquery;
  v_upper text;
begin
  if (p_terms is null or cardinality(p_terms) = 0) = (p_code is null) then
    raise exception 'Give either search terms or a code.' using errcode = '22023';
  end if;
  if p_code is not null and p_code !~ '^[0-9]{2,10}$' then
    raise exception 'The code must be 2 to 10 digits.' using errcode = '22023';
  end if;
  if p_terms is not null and (
    cardinality(p_terms) > 8
    or exists (select 1 from unnest(p_terms) t where t !~ '^[a-z0-9]{1,40}$')
  ) then
    raise exception 'Search terms must be up to 8 words of letters and digits.' using errcode = '22023';
  end if;

  if p_code is not null then
    -- The next code of the same length bounds the subtree for the index:
    -- '6402' → '6403', '6499' → '6500'.
    v_upper := lpad((p_code::numeric + 1)::text, length(p_code), '0');
  else
    v_query := to_tsquery('english', (select string_agg(t || ':*', ' & ') from unnest(p_terms) t));
  end if;

  return query
  with matched as (
    select l.release_id, l.hts_code, l.indent, l.description, l.ancestor_descriptions, l.units,
      l.general_rate, l.rate_from_code, count(*) over () as total_count
    from public.hts_lines l
    join public.hts_releases r on r.id = l.release_id and r.status = 'current'
    where (p_code is null or (l.hts_code >= p_code and l.hts_code < v_upper and starts_with(l.hts_code, p_code)))
      and (v_query is null or l.search_vector @@ v_query)
    order by l.hts_code
    limit least(greatest(coalesce(p_limit, 150), 1), 500)
  ),
  -- Scope prefixes covering the line (its own prefixes) or under it.
  scope_hits as (
    select m.hts_code, d.program_key, d.origin_countries
    from matched m
    join public.additional_duty_scope s
      on s.hts_prefix = any (array(select left(m.hts_code, n) from generate_series(4, length(m.hts_code)) n))
      or (length(m.hts_code) < 10
          and s.hts_prefix > m.hts_code
          and s.hts_prefix < lpad((m.hts_code::numeric + 1)::text, length(m.hts_code), '0')
          and starts_with(s.hts_prefix, m.hts_code))
    join public.additional_duties d on d.id = s.duty_id
    where not s.excluded
      and d.hts_scope = 'listed'
      and d.rate_type <> 'exempt'
      and d.legal_status <> 'expired'
      and (d.effective_to is null or d.effective_to >= current_date)
  ),
  -- origins null = any origin.
  program_hits as (
    select h.hts_code, h.program_key, h.origin_countries as origins
    from scope_hits h
    union all
    select m.hts_code, p.key, p.trigger_origins
    from matched m
    join public.duty_programs p
      on p.trigger_hts_prefixes is not null
      and exists (
        select 1 from unnest(p.trigger_hts_prefixes) tp
        where starts_with(m.hts_code, tp) or starts_with(tp, m.hts_code)
      )
  ),
  badges as (
    select g.hts_code,
      jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'origins', g.origins) order by p.sort_order) as may_apply
    from (
      select ph.hts_code, ph.program_key,
        case when bool_or(ph.origins is null) then null
          else to_jsonb(array(
            select distinct c
            from program_hits x, unnest(x.origins) c
            where x.hts_code = ph.hts_code and x.program_key = ph.program_key
            order by c
          ))
        end as origins
      from program_hits ph
      group by ph.hts_code, ph.program_key
    ) g
    join public.duty_programs p on p.key = g.program_key
    group by g.hts_code
  )
  select m.hts_code, m.indent, m.description, m.ancestor_descriptions, m.units, m.general_rate, m.rate_from_code,
    exists (
      select 1 from public.hts_lines c
      where c.release_id = m.release_id
        and c.hts_code > m.hts_code
        and c.hts_code < lpad((m.hts_code::numeric + 1)::text, length(m.hts_code), '0')
        and starts_with(c.hts_code, m.hts_code)
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object('code', a.hts_code, 'description', a.description) order by a.hts_code)
      from public.hts_lines a
      where a.release_id = m.release_id
        and a.hts_code = any (array[left(m.hts_code, 4), left(m.hts_code, 6), left(m.hts_code, 8)])
        and a.hts_code <> m.hts_code
    ), '[]'::jsonb),
    coalesce(b.may_apply, '[]'::jsonb),
    m.total_count
  from matched m
  left join badges b on b.hts_code = m.hts_code
  order by m.hts_code;
end;
$$;

revoke all on function search_hts_lines(text[], text, integer) from public, anon;
grant execute on function search_hts_lines(text[], text, integer) to authenticated;
