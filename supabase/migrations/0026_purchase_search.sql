-- Finding a purchase (owner intent, Lando 2026-10-19: "a search option for
-- owners and PM if they need to find a specific purchase; they should be able
-- to ask and receive matches"). Owners search everything; the project manager
-- (money.view) only the jobs he is on; the Mac asks the same question for an
-- owner who asks the bot.
--
--   purchases.search     a generated tsvector over the words on a receipt line
--                        (description, sku, the register name, store, vendor,
--                        department, class), 'simple' config so nothing is
--                        stemmed away; GIN indexed. The site asks with
--                        to_tsquery('simple', 'word:* & word:*').
--   purchases.trip_key   the trip a line belongs to, as src/lib/crew/purchases.ts
--                        tripKey computes it (the source key up to its last
--                        colon), generated once so a search can bring back the
--                        whole trip around a matched line.
--   trigram index        on description, for the fallback when full text finds
--                        nothing ("drywal", "ultralite": similarity > 0.3).
--   purchases_search()   the one read: the top trips with every line and a
--                        `matched` flag, ranked by full-text rank (or trigram
--                        similarity in 'fuzzy' mode) then date. Scope, trade
--                        and dates are filters; the caller (the site, service
--                        role) decides the scope.
--
-- Additive only. Service-role access only, as 0022.

begin;

create extension if not exists pg_trgm with schema extensions;

alter table public.purchases
  add column if not exists search tsvector generated always as (
    to_tsvector('simple',
      coalesce(description, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(job_name_raw, '') || ' ' ||
      coalesce(store, '') || ' ' || coalesce(vendor, '') || ' ' || coalesce(department, '') || ' ' || coalesce(class, ''))
  ) stored;

alter table public.purchases
  add column if not exists trip_key text generated always as (
    case when position(':' in source_key) > 0 then regexp_replace(source_key, ':[^:]*$', '') else source_key end
  ) stored;

create index if not exists purchases_search_idx on public.purchases using gin (search);
create index if not exists purchases_description_trgm_idx on public.purchases using gin (description extensions.gin_trgm_ops);
create index if not exists purchases_trip_key_idx on public.purchases (trip_key);

-- The search. p_words are plain lowercase words (the site strips punctuation
-- and takes dates and job names out first). p_mode 'full-text' matches every
-- word as a prefix in `search`; 'fuzzy' matches every word by trigram
-- similarity to the description (word_similarity > 0.3), for misspellings.
-- No words at all = every trip within the filters, newest first.
-- p_jobs null = every job; an empty array = nothing. Returns the lines of the
-- top p_trips trips (p_lines each, matched lines first), with the trip's
-- rank, full total and line count, and how many trips matched in all.
create or replace function public.purchases_search(
  p_words text[],
  p_mode text default 'full-text',
  p_jobs text[] default null,
  p_trade text default '',
  p_from date default null,
  p_to date default null,
  p_trips integer default 50,
  p_lines integer default 40
)
returns table (
  trip_key text,
  rank real,
  total_trips integer,
  trip_cents bigint,
  trip_lines integer,
  source_key text,
  purchased_on date,
  store text,
  vendor text,
  job_id text,
  job_name text,
  job_name_raw text,
  trade text,
  description text,
  sku text,
  qty numeric,
  line_total_cents integer,
  matched boolean
)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  with words as (
    select w from (select regexp_replace(lower(w), '[^a-z0-9]+', '', 'g') as w from unnest(coalesce(p_words, '{}'::text[])) w) x where w <> ''
  ),
  q as (
    select (select count(*) from words)::int as n,
           (select to_tsquery('simple', string_agg(w || ':*', ' & ')) from words) as tsq
  ),
  scoped as (
    select p.id, p.trip_key, p.purchased_on, p.search, p.description
      from public.purchases p
     where (p_jobs is null or p.job_id = any (p_jobs))
       and (coalesce(p_trade, '') = '' or p.trade = p_trade)
       and (p_from is null or p.purchased_on >= p_from)
       and (p_to is null or p.purchased_on <= p_to)
  ),
  hit as (
    select s.id, s.trip_key, s.purchased_on,
           case
             when q.n = 0 then 0::real
             when p_mode = 'fuzzy' then (select sum(word_similarity(w.w, s.description)) from words w)::real
             else ts_rank(s.search, q.tsq)
           end as rank
      from scoped s, q
     where q.n = 0
        or (p_mode = 'fuzzy' and (select bool_and(word_similarity(w.w, s.description) > 0.3) from words w))
        or (p_mode <> 'fuzzy' and s.search @@ q.tsq)
  ),
  trips as (
    select h.trip_key, max(h.rank) as rank, max(h.purchased_on) as day
      from hit h
     group by h.trip_key
  ),
  top as (
    select t.trip_key, t.rank, t.day, (count(*) over ())::int as total_trips
      from trips t
     order by t.rank desc, t.day desc, t.trip_key desc
     limit greatest(1, least(coalesce(p_trips, 50), 200))
  ),
  lines as (
    select p.id, p.trip_key, p.source_key, p.purchased_on, p.store, p.vendor, p.job_id, p.job_name_raw, p.trade,
           p.description, p.sku, p.qty, p.line_total_cents,
           -- With no words there is nothing to point at: every line is plain.
           (h.id is not null and q.n > 0) as matched,
           t.rank as trip_rank, t.day as trip_day, t.total_trips,
           sum(p.line_total_cents) over (partition by p.trip_key) as trip_cents,
           (count(*) over (partition by p.trip_key))::int as trip_lines,
           row_number() over (partition by p.trip_key order by (h.id is not null) desc, p.id) as n
      from scoped s
      join public.purchases p on p.id = s.id
      join top t on t.trip_key = p.trip_key
      left join hit h on h.id = p.id
      cross join q
  )
  select l.trip_key, l.trip_rank, l.total_trips, l.trip_cents, l.trip_lines,
         l.source_key, l.purchased_on, l.store, l.vendor, l.job_id, j.name, l.job_name_raw, l.trade,
         l.description, l.sku, l.qty, l.line_total_cents, l.matched
    from lines l
    left join public.crew_jobs j on j.id = l.job_id
   where l.n <= greatest(1, least(coalesce(p_lines, 40), 200))
   order by l.trip_rank desc, l.trip_day desc, l.trip_key desc, l.matched desc, l.id;
$$;

revoke execute on function public.purchases_search(text[], text, text[], text, date, date, integer, integer) from public, anon, authenticated;
grant execute on function public.purchases_search(text[], text, text[], text, date, date, integer, integer) to service_role;

comment on column public.purchases.search is 'Full-text words of the line (description, sku, register name, store, vendor, department, class), simple config.';
comment on column public.purchases.trip_key is 'The trip the line belongs to: the source key up to its last colon (tripKey in src/lib/crew/purchases.ts).';
comment on function public.purchases_search(text[], text, text[], text, date, date, integer, integer) is 'Find a purchase: top trips by full-text rank (or trigram similarity in fuzzy mode) with every line and a matched flag. Service role only.';

commit;
