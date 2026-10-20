-- Home Depot purchases, linked to jobs and tracked by trade (owner decisions,
-- Lando 2026-10-19: owners and the project manager answer "Which job is
-- this?"; the trades are a short list).
--
-- The office Mac (Saddlewood-KB) holds the Pro Xtra purchase history: one row
-- per receipt line, with the job name typed at the register, spelled however
-- the cashier heard it ("POINT LOMA", "Point Loma", "PT LOMA"). It posts the
-- lines to POST /api/bot/purchases. The site keeps them here and links each
-- line to a field job through job_aliases (the normalized register name ->
-- crew_jobs.id) and to a trade through trade_map (Home Depot's department and
-- class -> framing, drywall, electrical, plumbing, paint, tools, rentals,
-- general).
--
--   purchases            one row per receipt line. source_key is the Mac's own
--                        id (hd:<yyyymmdd>:<store>:<register>:<transaction>:<n>),
--                        so a resend upserts. A trip is everything before the
--                        last colon. job_key is the normalized register name:
--                        computed by the site (src/lib/crew/purchases.ts
--                        normalizeJobName) and stored on every upsert, so one
--                        rule in one place decides what matches an alias.
--   job_aliases          which job a register name is. job_id null = "not a
--                        job, ignore it" (a quote, a personal purchase).
--   trade_map            department (and class; '' = the whole department)
--                        -> trade. Lookup: exact (department, class), then
--                        (department, ''), else 'general'. Seeded from Home
--                        Depot's names; the site only reads it for now.
--   purchases_unmatched  the names still waiting for an answer, with trips,
--                        spend and the last date (the Crew tab and Waiting on
--                        you read this, not the lines).
--   purchases_relink     re-points every line with a name after someone
--                        answers the card, and gives it its trade again.
--
-- Additive only. Same rules as 0011: RLS on with no policies, service role only.

begin;

create table if not exists public.purchases (
  id                bigserial primary key,
  source            text not null,
  source_key        text not null,
  purchased_on      date not null,
  vendor            text not null default 'Home Depot',
  store             text not null default '',
  order_ref         text not null default '',
  job_name_raw      text not null default '',
  -- normalizeJobName(job_name_raw); '' when no name was typed.
  job_key           text not null default '',
  job_id            text references public.crew_jobs (id) on update cascade on delete set null,
  trade             text not null default '',
  department        text not null default '',
  class             text not null default '',
  sku               text not null default '',
  description       text not null default '',
  qty               numeric not null default 0,
  -- Negative for a return.
  line_total_cents  integer not null default 0,
  -- Whatever the Mac sends along, plus "ignored": true when the name is set aside.
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint purchases_source_check check (source in ('hd', 'app')),
  constraint purchases_source_key_check check (btrim(source_key) <> '' and length(source_key) <= 120),
  constraint purchases_source_key_uidx unique (source_key)
);

create index if not exists purchases_job_day_idx on public.purchases (job_id, purchased_on);
create index if not exists purchases_day_idx on public.purchases (purchased_on);
create index if not exists purchases_job_key_idx on public.purchases (job_key);
-- The 90-day lowest price per sku, for the Mac's price flags.
create index if not exists purchases_sku_day_idx on public.purchases (sku, purchased_on) where sku <> '';

create table if not exists public.job_aliases (
  -- The normalized register name: lowercased, punctuation stripped, spaces collapsed.
  alias       text primary key,
  -- null = not a job, ignore it.
  job_id      text references public.crew_jobs (id) on update cascade on delete cascade,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint job_aliases_alias_check check (btrim(alias) <> '' and length(alias) <= 120)
);

create table if not exists public.trade_map (
  id          serial primary key,
  department  text not null,
  -- '' = the whole department.
  class       text not null default '',
  trade       text not null,
  constraint trade_map_trade_check check (trade in ('framing', 'drywall', 'electrical', 'plumbing', 'paint', 'tools', 'rentals', 'general')),
  constraint trade_map_dept_class_uidx unique (department, class)
);

-- Home Depot's department and class names, as the Pro Xtra export spells them.
-- Anything not here is 'general'.
insert into public.trade_map (department, class, trade) values
  ('BLDG. MATERIALS', 'GYPSUM', 'drywall'),
  ('BLDG. MATERIALS', '', 'general'),
  ('LUMBER', '', 'framing'),
  ('HARDWARE', 'FASTENERS', 'general'),
  ('HARDWARE', 'POWER TOOL ACCESSORIES', 'tools'),
  ('HARDWARE', 'HAND TOOLS', 'tools'),
  ('HARDWARE', '', 'general'),
  ('ELECTRICAL', '', 'electrical'),
  ('PLUMBING', '', 'plumbing'),
  ('PAINT', '', 'paint'),
  ('TOOL RENTAL', '', 'rentals')
on conflict (department, class) do nothing;

-- The names still waiting for "Which job is this?": lines with no job that
-- nobody set aside, one row per normalized name. A trip is the source key up
-- to its last colon (the same rule as src/lib/crew/purchases.ts tripKey).
create or replace view public.purchases_unmatched with (security_invoker = true) as
select job_key,
       (array_agg(job_name_raw order by purchased_on desc, id desc))[1] as name,
       count(distinct case when position(':' in source_key) > 0 then regexp_replace(source_key, ':[^:]*$', '') else source_key end)::int as trips,
       count(*)::int as lines,
       sum(line_total_cents)::bigint as cents,
       max(purchased_on) as last_on,
       min(purchased_on) as first_on
  from public.purchases
 where job_id is null
   and job_key <> ''
   and coalesce(meta ->> 'ignored', '') <> 'true'
 group by job_key;

-- After an answer: every line with that name gets the job (or, with no job,
-- is set aside), and its trade again from trade_map. -> how many lines moved.
create or replace function public.purchases_relink(p_key text, p_job text)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with changed as (
    update public.purchases p
       set job_id = p_job,
           meta = case when p_job is null then p.meta || '{"ignored": true}'::jsonb else p.meta - 'ignored' end,
           trade = coalesce(
             (select t.trade from public.trade_map t
               where upper(btrim(t.department)) = upper(btrim(p.department))
                 and upper(btrim(t.class)) = upper(btrim(p.class))
               limit 1),
             (select t.trade from public.trade_map t
               where upper(btrim(t.department)) = upper(btrim(p.department))
                 and t.class = ''
               limit 1),
             'general'),
           updated_at = now()
     where p.job_key = p_key
     returning 1
  )
  select count(*)::int from changed;
$$;

alter table public.purchases enable row level security;
alter table public.job_aliases enable row level security;
alter table public.trade_map enable row level security;

-- The server (the service role) is the only reader and writer, as with every
-- crew table (0011): nothing for the browser's keys, with or without a policy.
revoke all on table public.purchases, public.job_aliases, public.trade_map, public.purchases_unmatched from anon, authenticated;
grant select, insert, update, delete on table public.purchases, public.job_aliases, public.trade_map to service_role;
grant select on table public.purchases_unmatched to service_role;
grant usage, select on sequence public.purchases_id_seq, public.trade_map_id_seq to service_role;
revoke execute on function public.purchases_relink(text, text) from public, anon, authenticated;
grant execute on function public.purchases_relink(text, text) to service_role;

comment on table public.purchases is 'Home Depot (and app) receipt lines from the Mac, one row each, linked to a field job by the register name. Service-role access only.';
comment on column public.purchases.source_key is 'The Mac''s id for the line: hd:<yyyymmdd>:<store>:<register>:<transaction>:<n>. A trip is everything before the last colon.';
comment on column public.purchases.job_key is 'The register name normalized by the site (normalizeJobName); what job_aliases.alias matches.';
comment on table public.job_aliases is 'Which field job a register name is; job_id null = not a job, ignore it. Service-role access only.';
comment on table public.trade_map is 'Home Depot department (and class) -> trade. Service-role access only.';
comment on view public.purchases_unmatched is 'Register names with lines on no job that nobody set aside: trips, spend, last date.';

commit;
