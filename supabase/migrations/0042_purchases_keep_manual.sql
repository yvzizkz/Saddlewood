-- Manual purchase edits survive the Mac's re-sync (PR #31 review).
--
-- 1. `job_manual`: a person put this line (or its whole trip) on a job, or took
--    it off one. The ingest upsert (src/lib/crew/purchaseQueries.ts) keeps the
--    job on such lines, as it keeps the trade on `trade_manual` lines (0030),
--    and a register alias rule (purchases_relink) leaves them alone.
-- 2. `purchases_assign`: put one trip or some lines on a job (or none) without
--    touching the alias rule for their register name. Assigning a job clears
--    the "set aside" mark; unassigning does not set it.

begin;

alter table public.purchases
  add column if not exists job_manual boolean not null default false;

comment on column public.purchases.job_manual is 'True when a person set the job on this line or its trip, so a re-sync and alias rules keep it.';

create or replace function public.purchases_assign(p_source_keys text[], p_trip_key text, p_job text)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with changed as (
    update public.purchases p
       set job_id = p_job,
           job_manual = true,
           meta = coalesce(p.meta, '{}'::jsonb) - 'ignored',
           updated_at = now()
     where (p_source_keys is not null and cardinality(p_source_keys) > 0 and p.source_key = any (p_source_keys))
        or ((p_source_keys is null or cardinality(p_source_keys) = 0) and p_trip_key is not null and p.trip_key = p_trip_key)
     returning 1
  )
  select count(*)::int from changed;
$$;

revoke execute on function public.purchases_assign(text[], text, text) from public, anon, authenticated;
grant execute on function public.purchases_assign(text[], text, text) to service_role;

-- The alias rule moves every line under a register name, except lines a person placed by hand.
create or replace function public.purchases_relink(p_key text, p_job text)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with changed as (
    update public.purchases p
       set job_id = p_job,
           meta = case when p_job is null then p.meta || '{"ignored": true}'::jsonb else p.meta - 'ignored' end,
           trade = case
             when p.trade_manual then p.trade
             else coalesce(
               (select t.trade from public.trade_map t
                 where upper(btrim(t.department)) = upper(btrim(p.department))
                   and upper(btrim(t.class)) = upper(btrim(p.class))
                 limit 1),
               (select t.trade from public.trade_map t
                 where upper(btrim(t.department)) = upper(btrim(p.department))
                   and t.class = ''
                 limit 1),
               'general')
           end,
           updated_at = now()
     where p.job_key = p_key
       and not p.job_manual
     returning 1
  )
  select count(*)::int from changed;
$$;

revoke execute on function public.purchases_relink(text, text) from public, anon, authenticated;
grant execute on function public.purchases_relink(text, text) to service_role;

commit;
